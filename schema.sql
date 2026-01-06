CREATE DATABASE IF NOT EXISTS edusmart_db;
USE edusmart_db;

-- 1. Users Table (Stores login info for everyone)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- Store hashed passwords (e.g., bcrypt)
    role ENUM('admin', 'teacher', 'student') NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Classes Table
CREATE TABLE classes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL -- e.g., 'Class 6'
);

-- 3. Students Table (Links to Users)
CREATE TABLE students (
    student_id INT PRIMARY KEY,
    roll_number VARCHAR(20),
    class_id INT,
    section VARCHAR(5),
    parent_phone VARCHAR(20) NOT NULL,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id)
);

-- 4. Subjects/Courses Table (Handles Teacher Assignment)
CREATE TABLE subjects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject_name VARCHAR(50) NOT NULL, -- e.g., 'Math', 'English'
    class_id INT NOT NULL,
    teacher_id INT, -- This is where you assign a teacher
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (teacher_id) REFERENCES users(id)
);

-- 5. Results Table (Stores Student Marks)
CREATE TABLE results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    exam_name VARCHAR(50) NOT NULL, -- e.g., 'Mid-Term'
    subject_id INT NOT NULL,
    marks DECIMAL(5, 2), -- e.g., 85.50
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

-- 6. Fee Types
CREATE TABLE fee_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL
);

-- 7. Invoices/Transactions
CREATE TABLE invoices (
    id VARCHAR(20) PRIMARY KEY, -- e.g., 'INV-1001'
    student_id INT NOT NULL,
    fee_type_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    status ENUM('Paid', 'Unpaid') DEFAULT 'Unpaid',
    month VARCHAR(20),
    year INT,
    issue_date DATE,
    paid_date DATE,
    payment_mode VARCHAR(20), -- Cash, bKash
    trx_id VARCHAR(50),
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (fee_type_id) REFERENCES fee_types(id)
);

-- 8. Attendance
CREATE TABLE attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    date DATE NOT NULL,
    status ENUM('present', 'absent') NOT NULL,
    FOREIGN KEY (student_id) REFERENCES users(id)
);

-- 9. Slides
CREATE TABLE slides (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT,
    subject_id INT,
    title VARCHAR(255),
    link TEXT,
    date DATE,
    teacher_id INT,
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    FOREIGN KEY (teacher_id) REFERENCES users(id)
);

-- SEED DATA
INSERT INTO classes (name) VALUES ('Class 6'), ('Class 7');

-- Default Admin (Password: admin123)
-- Note: In production, use bcrypt hash. For demo simple text or hash.
INSERT INTO users (username, password_hash, role, full_name, phone) 
VALUES ('admin', 'admin123', 'admin', 'Super Admin', '0000000000'); 
-- NOTE: For 'admin123', the plain text is used here. 
-- In the updated server.js, the system attempts a BCrypt compare first.
-- If that fails, it checks plain text (legacy fallback), ensuring this seed data works 
-- while enforcing security for new users.

