-- Create database
CREATE DATABASE IF NOT EXISTS gc_capstone;
USE gc_capstone;

-- Table for class years
CREATE TABLE IF NOT EXISTS class_years (
    year_id INT AUTO_INCREMENT PRIMARY KEY,
    year_value YEAR
);

-- Table for members. Formatting/Type of columns subject to change
CREATE TABLE IF NOT EXISTS members (
    member_id INT AUTO_INCREMENT PRIMARY KEY,
    class_year YEAR,
    last_name VARCHAR(100),
    first_name VARCHAR(100),
    preferred_name VARCHAR(100),
    city VARCHAR(100),
    state VARCHAR(50),
    email VARCHAR(255),
    candlelight_date VARCHAR(50),
    deceased VARCHAR(10),
    department VARCHAR(100),
    emeritus VARCHAR(20)
);