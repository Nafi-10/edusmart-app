const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ================= DATABASE CONNECTION POOL =================
// Optimized for concurrent users (30-50+ simultaneous connections)
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'edusmart_db',
    port: process.env.DB_PORT || 4000,          // Added Port
    ssl: { rejectUnauthorized: true },           // <--- REQUIRED for TiDB Cloud
    waitForConnections: true,
    connectionLimit: 10, // Sufficient for ~300 users with ~30 active at once
    queueLimit: 0
});

console.log('MySQL Connection Pool created. Ready for concurrent users.');

// ================= ROUTES =================

// 1. LOGIN (With BCrypt & Plain Text Fallback)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    const sql = 'SELECT * FROM users WHERE username = ?';
    db.query(sql, [username], async (err, results) => {
        if (err) return res.status(500).json(err);
        
        if (results.length > 0) {
            const user = results[0];
            
            // Check Password (Handle both Hashed and Legacy Plain Text)
            let match = false;
            try {
                match = await bcrypt.compare(password, user.password_hash);
            } catch (e) {
                // If bcrypt fails (e.g. data is not a hash), fall back to plain text check
                match = (password === user.password_hash);
            }
            
            // Fallback for seed data which might be plain text
            if (!match && password === user.password_hash) {
                match = true;
            }

            if (match) {
                // If student, fetch extra details
                if (user.role === 'student') {
                    const subSql = 'SELECT * FROM students WHERE student_id = ?';
                    db.query(subSql, [user.id], (err, subRes) => {
                        const studentData = subRes[0] || {};
                        res.json({ ...user, ...studentData });
                    });
                } else {
                    res.json(user);
                }
            } else {
                res.status(401).json({ message: 'Invalid credentials' });
            }
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    });
});

// 2. GET USERS (By Role)
app.get('/api/users', (req, res) => {
    const role = req.query.role;
    let sql = 'SELECT id, username, role, full_name as name, phone, email, created_at FROM users';
    let params = [];
    if (role) {
        sql += ' WHERE role = ?';
        params.push(role);
    }
    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// 3. ADD USER (Register) - Uses Transaction & BCrypt
app.post('/api/register', async (req, res) => {
    const { username, password, role, name, phone, email, studentDetails } = req.body;
    
    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(password, 10);

    // Get a dedicated connection from the pool for the transaction
    db.getConnection((err, connection) => {
        if (err) return res.status(500).json(err);

        connection.beginTransaction(err => {
            if (err) {
                connection.release();
                return res.status(500).json(err);
            }

            const userSql = 'INSERT INTO users (username, password_hash, role, full_name, phone, email) VALUES (?, ?, ?, ?, ?, ?)';
            
            connection.query(userSql, [username, hashedPassword, role, name, phone, email], (err, result) => {
                if (err) {
                    return connection.rollback(() => {
                        connection.release();
                        res.status(500).json(err);
                    });
                }
                
                const userId = result.insertId;

                if (role === 'student' && studentDetails) {
                    const studentSql = 'INSERT INTO students (student_id, roll_number, class_id, parent_phone) VALUES (?, ?, ?, ?)';
                    connection.query(studentSql, [userId, studentDetails.roll, studentDetails.classId, studentDetails.parentPhone], (err) => {
                        if (err) {
                            return connection.rollback(() => {
                                connection.release();
                                res.status(500).json(err);
                            });
                        }
                        connection.commit(() => {
                            connection.release();
                            res.json({ id: userId, message: 'Student registered' });
                        });
                    });
                } else {
                    connection.commit(() => {
                        connection.release();
                        res.json({ id: userId, message: 'User registered' });
                    });
                }
            });
        });
    });
});

// 4. SUBJECTS & TEACHER ASSIGNMENT
app.get('/api/subjects', (req, res) => {
    const sql = `
        SELECT s.*, c.name as class_name, u.full_name as teacher_name 
        FROM subjects s 
        JOIN classes c ON s.class_id = c.id 
        LEFT JOIN users u ON s.teacher_id = u.id
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

app.put('/api/subjects/:id/assign', (req, res) => {
    const { teacherId } = req.body;
    const sql = 'UPDATE subjects SET teacher_id = ? WHERE id = ?';
    db.query(sql, [teacherId, req.params.id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: 'Teacher assigned successfully' });
    });
});

// 5. RESULTS
app.post('/api/results', (req, res) => {
    const { studentId, exam, subjectId, marks } = req.body;
    const sql = 'INSERT INTO results (student_id, exam_name, subject_id, marks) VALUES (?, ?, ?, ?)';
    db.query(sql, [studentId, exam, subjectId, marks], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ id: result.insertId, message: 'Result published' });
    });
});

app.get('/api/results/:studentId', (req, res) => {
    const sql = `
        SELECT r.*, s.subject_name 
        FROM results r 
        JOIN subjects s ON r.subject_id = s.id 
        WHERE r.student_id = ?
    `;
    db.query(sql, [req.params.studentId], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// 6. INVOICES
app.get('/api/invoices', (req, res) => {
    // Basic filter support
    const { studentId, status } = req.query;
    let sql = 'SELECT * FROM invoices WHERE 1=1';
    let params = [];
    if(studentId) {
        sql += ' AND student_id = ?';
        params.push(studentId);
    }
    if(status) {
        sql += ' AND status = ?';
        params.push(status);
    }
    
    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

app.post('/api/invoices', (req, res) => {
    // Generate Invoice logic
    const { id, studentId, feeTypeId, amount, status, month, year, issueDate } = req.body;
    const sql = 'INSERT INTO invoices (id, student_id, fee_type_id, amount, status, month, year, issue_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    db.query(sql, [id, studentId, feeTypeId, amount, status, month, year, issueDate], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: 'Invoice created' });
    });
});

// Serve static files correctly
app.use(express.static(path.join(__dirname, '../')));

// Send index.html with a safe path
app.get('/', (req, res) => {
    const filePath = path.join(__dirname, '../index.html');

    // Debugging Log (Will show in Render logs if it fails)
    console.log('Attempting to serve:', filePath);

    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('Error sending file:', err);
            res.status(500).send("Error: Could not find index.html. Check logs.");
        }
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
