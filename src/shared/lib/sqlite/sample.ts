/** Seed script for the built-in sample database: a small shop with every SQLite feature the editor shows. */
export const SAMPLE_DB_NAME = "Sample shop";

export const SAMPLE_DB_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  city TEXT,
  joined_on TEXT NOT NULL DEFAULT (date('now')),
  vip INTEGER NOT NULL DEFAULT 0 CHECK (vip IN (0, 1))
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0,
  specs TEXT,
  thumbnail BLOB
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  ordered_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
  note TEXT
);

CREATE TABLE order_items (
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL,
  PRIMARY KEY (order_id, product_id)
) WITHOUT ROWID;

CREATE INDEX orders_customer ON orders(customer_id);
CREATE INDEX products_category ON products(category, price DESC);

CREATE VIEW order_totals AS
  SELECT o.id AS order_id, c.name AS customer, o.status, o.ordered_at,
         round(sum(i.quantity * i.unit_price), 2) AS total, count(*) AS items
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    JOIN order_items i ON i.order_id = o.id
   GROUP BY o.id;

CREATE TRIGGER order_items_stock AFTER INSERT ON order_items BEGIN
  UPDATE products SET stock = max(stock - new.quantity, 0) WHERE id = new.product_id;
END;

WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 60),
  first(k, v) AS (VALUES (0,'Asha'),(1,'Ben'),(2,'Chloé'),(3,'Dev'),(4,'Elif'),(5,'Farah'),(6,'Gus'),(7,'Hana'),(8,'Ivo'),(9,'Jun'),(10,'Kai'),(11,'Lena')),
  last(k, v) AS (VALUES (0,'Rao'),(1,'Okafor'),(2,'Martin'),(3,'Silva'),(4,'Kowalski'),(5,'Nakamura'),(6,'Haddad'),(7,'Berg'),(8,'Costa'),(9,'Ito')),
  city(k, v) AS (VALUES (0,'Delhi'),(1,'Lisbon'),(2,'Lagos'),(3,'Osaka'),(4,'Berlin'),(5,'Toronto'),(6,NULL))
INSERT INTO customers (name, email, city, joined_on, vip)
SELECT f.v || ' ' || l.v,
       CASE WHEN i % 9 = 0 THEN NULL ELSE lower(f.v || '.' || l.v) || i || '@example.com' END,
       c.v,
       date('2023-01-01', '+' || (i * 11 % 700) || ' days'),
       (i % 7 = 0)
  FROM n
  JOIN first f ON f.k = i * 5 % 12
  JOIN last l ON l.k = i * 3 % 10
  JOIN city c ON c.k = i * 2 % 7;

WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 40),
  adj(k, v) AS (VALUES (0,'Soft'),(1,'Linen'),(2,'Pastel'),(3,'Midnight'),(4,'Paper'),(5,'Ceramic'),(6,'Velvet'),(7,'Copper')),
  item(k, v, cat) AS (VALUES (0,'Notebook','Stationery'),(1,'Mug','Kitchen'),(2,'Lamp','Home'),(3,'Pen set','Stationery'),(4,'Throw','Home'),(5,'Teapot','Kitchen'),(6,'Planner','Stationery'),(7,'Vase','Home'))
INSERT INTO products (id, name, category, price, stock, specs)
SELECT i, a.v || ' ' || t.v, t.cat,
       round(4.5 + (i * 37 % 120) + (i % 4) * 0.25, 2),
       i * 13 % 90,
       CASE WHEN i % 3 = 0 THEN json_object('color', a.v, 'weight_g', i * 23 % 900, 'recycled', json(CASE WHEN i % 2 THEN 'true' ELSE 'false' END)) END
  FROM n
  JOIN adj a ON a.k = i % 8
  JOIN item t ON t.k = i * 3 % 8;

UPDATE products SET thumbnail = x'89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffffff7f0009fb03fd2a86e38a0000000049454e44ae426082'
 WHERE id IN (1, 2, 3);

WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 150)
INSERT INTO orders (id, customer_id, ordered_at, status, note)
SELECT i, 1 + (i * 17 % 60),
       datetime('2024-01-01 09:00:00', '+' || (i * 53 % 300) || ' days', '+' || (i * 7 % 600) || ' minutes'),
       CASE i % 10 WHEN 0 THEN 'cancelled' WHEN 1 THEN 'pending' WHEN 2 THEN 'pending' WHEN 3 THEN 'paid' ELSE 'shipped' END,
       CASE WHEN i % 11 = 0 THEN 'Gift wrap, please' END
  FROM n;

WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 150),
  k(j) AS (VALUES (1),(2),(3))
INSERT OR IGNORE INTO order_items (order_id, product_id, quantity, unit_price)
SELECT i, 1 + ((i * 7 + j * 11) % 40), 1 + ((i + j) % 4), p.price
  FROM n JOIN k ON j <= 1 + (i % 3)
  JOIN products p ON p.id = 1 + ((i * 7 + j * 11) % 40);
`;
