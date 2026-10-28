# Item & Purchase Management System

This is my project for managing items, item types and purchases.
I made it with Node.js, Express and MySQL. The frontend is simple HTML, CSS and JavaScript.

## What it can do

- Add, edit and delete item types and items
- Make items active or inactive
- Create a purchase (order) with many items. Every order gets its own ID like PO-00001
- Check stock before saving, so stock never goes below zero
- Update a purchase. Stock changes only by the difference in quantity
- Purchases cannot be deleted, they stay as history
- An item that was already purchased is not deleted, it is made inactive

## What you need

- Node.js (I used version 20.18.0)
- npm (I used version 10.8.2)
- MySQL (I used version 26.10.0, but any MySQL 8 or higher should work)

## How to run it

**1. Install the packages**

```
npm install
```

**2. Create the database**

Run the file `backend/schema.sql` in MySQL. It creates the database, the tables and some sample data.

```
mysql -u root -p < backend/schema.sql
```

You can also open the file in MySQL Workbench and run it there.
Only run it on a new database, because running it again will give errors.

**3. Add your MySQL details**

Copy `.env.example` and name the copy `.env`. Then put your own MySQL password in it.

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=item_purchase_db
DB_PORT=3306
```

**4. Start the server**

```
node backend/server.js
```

Now open http://localhost:3000 in the browser.
There is no separate command for the frontend, the same server shows the page.

## Sample data

| Item | Type | Stock |
|---|---|---|
| Laptop | Electronics | 10 |
| Mouse | Electronics | 20 |
| Chair | Furniture | 15 |

## Folders

```
backend/    server.js, db.js and schema.sql
frontend/   index.html, app.js and style.css
```

## API

Item types

- GET /api/item-types
- POST /api/item-types
- PUT /api/item-types/:id
- DELETE /api/item-types/:id

Items

- GET /api/items
- GET /api/items/:id
- POST /api/items
- PUT /api/items/:id
- DELETE /api/items/:id

Purchases

- GET /api/purchases
- GET /api/purchases/:id
- POST /api/purchases
- PUT /api/purchases/:id

There is no delete for purchases on purpose.

### Example

Create a purchase:

```
POST /api/purchases

{
  "purchase_date": "2026-08-25",
  "notes": "first order",
  "items": [
    { "item_id": 1, "quantity": 2 },
    { "item_id": 2, "quantity": 5 }
  ]
}
```

The total is worked out by the server from the item prices. If the same item is
sent two times, the quantities are added together.

If you ask for more than the stock, you get an error like this:

```
{ "message": "Insufficient stock for Laptop. Available: 8" }
```

### Error codes

- 400 - wrong or missing data
- 404 - item or purchase not found
- 409 - stock is not enough, or the item is inactive
- 500 - something went wrong on the server

## JOIN queries

Items with their type:

```sql
SELECT i.*, t.type_name AS item_type_name
FROM items i
JOIN item_types t ON i.item_type_id = t.id;
```

Purchase details:

```sql
SELECT p.order_id, p.purchase_date, i.name AS item_name,
       t.type_name, i.stock_available, pi.quantity
FROM purchases p
LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
LEFT JOIN items i ON i.id = pi.item_id
LEFT JOIN item_types t ON t.id = i.item_type_id
WHERE p.id = ?;
```

## Stock labels

- more than 5 - In Stock
- 1 to 5 - Low Stock
- 0 - Out of Stock
