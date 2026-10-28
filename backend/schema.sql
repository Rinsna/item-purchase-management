CREATE DATABASE IF NOT EXISTS item_purchase_db;
USE item_purchase_db;

CREATE TABLE item_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type_name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_type_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  description VARCHAR(255) NULL,
  purchase_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  price DECIMAL(10,2) NOT NULL,
  stock_available INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (item_type_id) REFERENCES item_types(id),
  CHECK (price >= 0),
  CONSTRAINT chk_items_stock CHECK (stock_available >= 0)
);

CREATE TABLE purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(20) NOT NULL UNIQUE,
  purchase_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  notes VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE purchase_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_id INT NOT NULL,
  item_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_id) REFERENCES purchases(id),
  FOREIGN KEY (item_id) REFERENCES items(id),
  CHECK (quantity > 0)
);

-- sample data (same as the example in the assignment)
INSERT INTO item_types (type_name, description) VALUES
  ('Electronics', 'Electronic devices and accessories'),
  ('Furniture', 'Chairs, tables and other furniture');

INSERT INTO items (item_type_id, name, description, purchase_date, price, stock_available) VALUES
  (1, 'Laptop', '15 inch laptop', '2026-08-25', 55000.00, 10),
  (1, 'Mouse', 'Wireless mouse', '2026-08-25', 500.00, 20),
  (2, 'Chair', 'Office chair', '2026-08-25', 3500.00, 15);
