-- Create database
CREATE DATABASE IF NOT EXISTS gc_capstone;
USE gc_capstone;

-- Drop child table first because of foreign key dependency
DROP TABLE IF EXISTS members;
DROP TABLE IF EXISTS class_years;

-- Table for class years
CREATE TABLE class_years (
    year_id INT AUTO_INCREMENT PRIMARY KEY,
    year_value YEAR NOT NULL UNIQUE
);

-- Table for members
-- Keep some imported fields as VARCHAR because source data is messy
CREATE TABLE members (
    member_id INT AUTO_INCREMENT PRIMARY KEY,
    last_name VARCHAR(100),
    first_name VARCHAR(100),
    preferred_name VARCHAR(100),
    city VARCHAR(100),
    state VARCHAR(50),
    email VARCHAR(255),
    candlelight_date VARCHAR(50),
    deceased VARCHAR(10),
    department VARCHAR(100),
    emeritus VARCHAR(20),
    year_id INT,
    
    CONSTRAINT fk_members_year
        FOREIGN KEY (year_id) REFERENCES class_years(year_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);
