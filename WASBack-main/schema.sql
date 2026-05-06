CREATE DATABASE IF NOT EXISTS wa_scheduler;
USE wa_scheduler;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) UNIQUE,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  role ENUM('admin', 'user') DEFAULT 'user',
  timezone VARCHAR(100) DEFAULT 'Asia/Kolkata',
  full_name VARCHAR(255),
  mobile VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wa_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  group_jid VARCHAR(255),
  name VARCHAR(255),
  participants_count INT,
  profile_pic_url TEXT,
  UNIQUE KEY uq_user_group (user_id, group_jid),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wa_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  phone VARCHAR(255),
  name VARCHAR(255),
  profile_pic_url TEXT,
  last_synced DATETIME,
  UNIQUE KEY uq_user_contact (user_id, phone),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  recipient VARCHAR(255),
  message_body TEXT,
  media_path VARCHAR(255),
  media_type VARCHAR(50),
  media_filename VARCHAR(255),
  type VARCHAR(50),
  scheduled_at DATETIME,
  user_timezone VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending',
  sent_at DATETIME,
  wa_message_id VARCHAR(255),
  ack_status INT DEFAULT 0,
  total_recipients INT DEFAULT 0,
  error_message TEXT,
  recurrence ENUM('none','daily','weekly','monthly') DEFAULT 'none',
  recurrence_end_date DATETIME NULL,
  parent_message_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wa_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  session_file VARCHAR(500) NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_session (user_id, session_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
