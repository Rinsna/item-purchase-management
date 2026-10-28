
const express = require("express");
const path = require("path");
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// checks a date like 2026-08-25 (what the date input sends)
function isValidDate(text) {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }
  const date = new Date(text);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

// an error we throw ourselves, with the http status to send back
class PurchaseError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// ids from the url must be whole numbers above zero
function isValidId(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

// Test routes
app.get("/api/test", (req, res) => {
  res.json({ success: true, message: "API is working" });
});

app.get("/api/test-db", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS result");
    res.json({ success: true, result: rows[0].result });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: "Database connection failed" });
  }
});

// ITEM TYPES
app.get("/api/item-types", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM item_types ORDER BY id DESC"
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Could not load item types" });
  }
});

app.post("/api/item-types", async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (name.trim().length > 100) {
      return res.status(400).json({ message: "Name must be 100 characters or less" });
    }

    const [result] = await pool.query(
      "INSERT INTO item_types (type_name, description) VALUES (?, ?)",
      [name.trim(), description || null]
    );

    res.status(201).json({
      message: "Item type created",
      id: result.insertId
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "This item type already exists" });
    }
    console.error(error.message);
    res.status(500).json({ message: "Could not create item type" });
  }
});

app.put("/api/item-types/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid item type id" });
    }

    const { name, description, is_active } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (name.trim().length > 100) {
      return res.status(400).json({ message: "Name must be 100 characters or less" });
    }

    if (is_active !== true && is_active !== false && is_active !== 0 && is_active !== 1) {
      return res.status(400).json({ message: "Status must be active or inactive" });
    }

    const [result] = await pool.query(
      "UPDATE item_types SET type_name = ?, description = ?, is_active = ? WHERE id = ?",
      [name.trim(), description || null, is_active ? 1 : 0, req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Item type not found" });
    }

    res.json({ message: "Item type updated" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "This item type already exists" });
    }
    console.error(error.message);
    res.status(500).json({ message: "Could not update item type" });
  }
});

// A type that has items is kept (made inactive) so those items still have a type.
// A type with no items is really deleted.
app.delete("/api/item-types/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid item type id" });
    }

    const [types] = await pool.query(
      "SELECT id FROM item_types WHERE id = ?",
      [req.params.id]
    );

    if (!types.length) {
      return res.status(404).json({ message: "Item type not found" });
    }

    const [used] = await pool.query(
      "SELECT COUNT(*) AS total FROM items WHERE item_type_id = ?",
      [req.params.id]
    );

    if (used[0].total > 0) {
      await pool.query("UPDATE item_types SET is_active = 0 WHERE id = ?", [req.params.id]);
      return res.json({
        message: "Item type has items, so it was marked inactive instead of deleted",
        deleted: false
      });
    }

    await pool.query("DELETE FROM item_types WHERE id = ?", [req.params.id]);
    res.json({ message: "Item type deleted", deleted: true });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: "Could not delete item type" });
  }
});

// ITEMS
app.get("/api/items", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT i.*, t.type_name AS item_type_name
      FROM items i
      JOIN item_types t ON i.item_type_id = t.id
      ORDER BY i.id DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: "Could not load items" });
  }
});

app.get("/api/items/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid item id" });
    }

    const [rows] = await pool.query(`
      SELECT i.*, t.type_name AS item_type_name
      FROM items i
      JOIN item_types t ON i.item_type_id = t.id
      WHERE i.id = ?
    `, [req.params.id]);

    if (!rows.length) {
      return res.status(404).json({ message: "Item not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: "Could not load item" });
  }
});

app.post("/api/items", async (req, res) => {
  try {
    const {
      item_type_id,
      name,
      description,
      purchase_date,
      price,
      stock_available,
      active
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Item name is required" });
    }

    if (name.trim().length > 150) {
      return res.status(400).json({ message: "Item name must be 150 characters or less" });
    }

    if (!item_type_id) {
      return res.status(400).json({ message: "Item type is required" });
    }

    if (!isValidDate(purchase_date)) {
      return res.status(400).json({ message: "A valid purchase date is required" });
    }

    if (active !== true && active !== false && active !== 0 && active !== 1) {
      return res.status(400).json({ message: "Status must be active or inactive" });
    }

    if (!Number.isFinite(Number(price)) || Number(price) < 0) {
      return res.status(400).json({ message: "Price must be zero or more" });
    }

    if (
      !Number.isInteger(Number(stock_available)) ||
      Number(stock_available) < 0
    ) {
      return res.status(400).json({
        message: "Stock must be a whole number of zero or more"
      });
    }

    const [types] = await pool.query(
      "SELECT id FROM item_types WHERE id = ? AND is_active = 1",
      [item_type_id]
    );

    if (!types.length) {
      return res.status(400).json({ message: "Invalid item type" });
    }

    const [result] = await pool.query(
      `INSERT INTO items
       (item_type_id, name, description, purchase_date, price, stock_available, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        item_type_id,
        name.trim(),
        description || null,
        purchase_date,
        Number(price),
        Number(stock_available),
        active ? 1 : 0
      ]
    );

    res.status(201).json({
      message: "Item created",
      id: result.insertId
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: "Could not create item" });
  }
});

app.put("/api/items/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid item id" });
    }

    const {
      item_type_id,
      name,
      description,
      purchase_date,
      price,
      stock_available,
      active
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Item name is required" });
    }

    if (name.trim().length > 150) {
      return res.status(400).json({ message: "Item name must be 150 characters or less" });
    }

    if (!item_type_id) {
      return res.status(400).json({ message: "Item type is required" });
    }

    if (!isValidDate(purchase_date)) {
      return res.status(400).json({ message: "A valid purchase date is required" });
    }

    if (active !== true && active !== false && active !== 0 && active !== 1) {
      return res.status(400).json({ message: "Status must be active or inactive" });
    }

    if (!Number.isFinite(Number(price)) || Number(price) < 0) {
      return res.status(400).json({ message: "Invalid price" });
    }

    if (
      !Number.isInteger(Number(stock_available)) ||
      Number(stock_available) < 0
    ) {
      return res.status(400).json({ message: "Invalid stock quantity" });
    }

    const [types] = await pool.query(
      "SELECT id FROM item_types WHERE id = ?",
      [item_type_id]
    );

    if (!types.length) {
      return res.status(400).json({ message: "Invalid item type" });
    }

    const [result] = await pool.query(
      `UPDATE items
       SET item_type_id = ?, name = ?, description = ?, purchase_date = ?,
           price = ?, stock_available = ?, active = ?
       WHERE id = ?`,
      [
        item_type_id,
        name.trim(),
        description || null,
        purchase_date,
        Number(price),
        Number(stock_available),
        active ? 1 : 0,
        req.params.id
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Item not found" });
    }

    res.json({ message: "Item updated" });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: "Could not update item" });
  }
});

// An item that was already purchased is kept (made inactive) so history stays correct.
// An item that was never purchased is really deleted.
app.delete("/api/items/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid item id" });
    }

    const [items] = await pool.query(
      "SELECT id FROM items WHERE id = ?",
      [req.params.id]
    );

    if (!items.length) {
      return res.status(404).json({ message: "Item not found" });
    }

    const [used] = await pool.query(
      "SELECT COUNT(*) AS total FROM purchase_items WHERE item_id = ?",
      [req.params.id]
    );

    if (used[0].total > 0) {
      await pool.query("UPDATE items SET active = 0 WHERE id = ?", [req.params.id]);
      return res.json({
        message: "Item is used in purchases, so it was marked inactive instead of deleted",
        deleted: false
      });
    }

    await pool.query("DELETE FROM items WHERE id = ?", [req.params.id]);
    res.json({ message: "Item deleted", deleted: true });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: "Could not delete item" });
  }
});

// PURCHASES
app.post("/api/purchases", async (req, res) => {
  let connection;

  try {
    const { items, notes, purchase_date } = req.body;

    if (!isValidDate(purchase_date)) {
      return res.status(400).json({ message: "A valid purchase date is required" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "Add at least one item to the purchase"
      });
    }

    // simplify stock checking.
    const quantities = new Map();

    for (const line of items) {
      const id = Number(line.item_id);
      const quantity = Number(line.quantity);

      if (
        !Number.isInteger(id) || id <= 0 ||
        !Number.isInteger(quantity) || quantity <= 0
      ) {
        return res.status(400).json({
          message: "Each item needs a valid ID and positive whole quantity"
        });
      }

      quantities.set(id, (quantities.get(id) || 0) + quantity);
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [purchaseResult] = await connection.query(
      "INSERT INTO purchases (order_id, purchase_date, total_amount, notes) VALUES (?, ?, 0, ?)",
      ["T-" + Math.random().toString(36).slice(2, 14), purchase_date, notes || null]
    );

    const purchaseId = purchaseResult.insertId;

    // real order id like PO-00001, built from the new row id
    const orderId = "PO-" + String(purchaseId).padStart(5, "0");
    await connection.query(
      "UPDATE purchases SET order_id = ? WHERE id = ?",
      [orderId, purchaseId]
    );
    let total = 0;

    for (const [itemId, quantity] of quantities) {
      const [rows] = await connection.query(
        `SELECT id, name, price, stock_available, active
         FROM items
         WHERE id = ?
         FOR UPDATE`,
        [itemId]
      );

      if (!rows.length) {
        throw new PurchaseError(`Item ${itemId} not found`, 404);
      }

      const item = rows[0];

      if (!item.active) {
        throw new PurchaseError(
          `Item is inactive and cannot be purchased (${item.name})`,
          409
        );
      }

      if (item.stock_available < quantity) {
        throw new PurchaseError(
          `Insufficient stock for ${item.name}. Available: ${item.stock_available}`,
          409
        );
      }

      const price = Number(item.price);
      total += price * quantity;

      await connection.query(
        `INSERT INTO purchase_items
         (purchase_id, item_id, quantity, unit_price)
         VALUES (?, ?, ?, ?)`,
        [purchaseId, itemId, quantity, price]
      );

      await connection.query(
        `UPDATE items
         SET stock_available = stock_available - ?
         WHERE id = ?`,
        [quantity, itemId]
      );
    }

    await connection.query(
      "UPDATE purchases SET total_amount = ? WHERE id = ?",
      [total, purchaseId]
    );

    await connection.commit();

    res.status(201).json({
      message: "Purchase created",
      purchase_id: purchaseId,
      total_amount: Number(total.toFixed(2))
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    // our own validation errors are safe to show, database errors are not
    if (error instanceof PurchaseError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error(error.message);
    res.status(500).json({ message: "Could not save the purchase" });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Update a purchase. Stock is changed only by the difference between the
// old quantity and the new quantity (3 -> 5 takes 2 more, 5 -> 2 gives 3 back).
app.put("/api/purchases/:id", async (req, res) => {
  let connection;

  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid purchase id" });
    }

    const { items, notes, purchase_date } = req.body;

    if (!isValidDate(purchase_date)) {
      return res.status(400).json({ message: "A valid purchase date is required" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "A purchase must contain at least one item"
      });
    }

    // new quantity for each item (same item twice gets added together)
    const newQuantities = new Map();

    for (const line of items) {
      const id = Number(line.item_id);
      const quantity = Number(line.quantity);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Each line needs a valid item id" });
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ message: "Quantity must be greater than zero" });
      }

      newQuantities.set(id, (newQuantities.get(id) || 0) + quantity);
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [purchases] = await connection.query(
      "SELECT id, order_id FROM purchases WHERE id = ? FOR UPDATE",
      [req.params.id]
    );

    if (!purchases.length) {
      throw new PurchaseError("Purchase not found", 404);
    }

    const [oldLines] = await connection.query(
      "SELECT item_id, quantity, unit_price FROM purchase_items WHERE purchase_id = ?",
      [req.params.id]
    );

    const oldQuantities = new Map();
    const oldPrices = new Map();

    for (const line of oldLines) {
      oldQuantities.set(line.item_id, line.quantity);
      oldPrices.set(line.item_id, Number(line.unit_price));
    }

    // every item that was in the old purchase or is in the new one,
    // in id order so two updates at the same time lock rows in the same order
    const itemIds = [...new Set([...oldQuantities.keys(), ...newQuantities.keys()])]
      .sort((a, b) => a - b);

    const prices = new Map();

    for (const itemId of itemIds) {
      const [rows] = await connection.query(
        "SELECT id, name, price, stock_available, active FROM items WHERE id = ? FOR UPDATE",
        [itemId]
      );

      if (!rows.length) {
        throw new PurchaseError(`Item ${itemId} not found`, 404);
      }

      const item = rows[0];
      const oldQuantity = oldQuantities.get(itemId) || 0;
      const newQuantity = newQuantities.get(itemId) || 0;
      const difference = newQuantity - oldQuantity;

      // an old line that stays the same price as when it was bought
      prices.set(itemId, oldPrices.has(itemId) ? oldPrices.get(itemId) : Number(item.price));

      if (difference > 0) {
        if (!item.active) {
          throw new PurchaseError(
            `Item is inactive and cannot be purchased (${item.name})`,
            409
          );
        }

        if (item.stock_available < difference) {
          throw new PurchaseError(
            `Insufficient stock for ${item.name}. Available: ${item.stock_available}`,
            409
          );
        }
      }

      if (difference !== 0) {
        await connection.query(
          "UPDATE items SET stock_available = stock_available - ? WHERE id = ?",
          [difference, itemId]
        );
      }
    }

    // rewrite the purchase lines and the total
    await connection.query("DELETE FROM purchase_items WHERE purchase_id = ?", [req.params.id]);

    let total = 0;

    for (const [itemId, quantity] of newQuantities) {
      const price = prices.get(itemId);
      total += price * quantity;

      await connection.query(
        `INSERT INTO purchase_items (purchase_id, item_id, quantity, unit_price)
         VALUES (?, ?, ?, ?)`,
        [req.params.id, itemId, quantity, price]
      );
    }

    await connection.query(
      "UPDATE purchases SET purchase_date = ?, notes = ?, total_amount = ? WHERE id = ?",
      [purchase_date, notes || null, total, req.params.id]
    );

    await connection.commit();

    res.json({
      message: "Purchase updated",
      order_id: purchases[0].order_id,
      total_amount: Number(total.toFixed(2))
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    if (error instanceof PurchaseError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error(error.message);
    res.status(500).json({ message: "Could not update the purchase" });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Purchase history
app.get("/api/purchases", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        p.id,
        p.order_id,
        p.purchase_date,
        p.total_amount,
        p.notes,
        COUNT(pi.id) AS line_count
      FROM purchases p
      LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
      GROUP BY p.id, p.order_id, p.purchase_date, p.total_amount, p.notes
      ORDER BY p.id DESC
    `);

    res.json(rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: "Could not load purchase history" });
  }
});


app.get("/api/purchases/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid purchase id" });
    }

    const [rows] = await pool.query(`
      SELECT
        p.id AS purchase_id,
        p.order_id,
        p.purchase_date,
        p.total_amount,
        p.notes,
        pi.item_id,
        i.name AS item_name,
        t.type_name,
        i.stock_available,
        pi.quantity,
        pi.unit_price,
        (pi.quantity * pi.unit_price) AS line_total
      FROM purchases p
      LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
      LEFT JOIN items i ON i.id = pi.item_id
      LEFT JOIN item_types t ON t.id = i.item_type_id
      WHERE p.id = ?
    `, [req.params.id]);

    if (!rows.length) {
      return res.status(404).json({ message: "Purchase not found" });
    }

    res.json(rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: "Could not load purchase" });
  }
});



// last stop for errors that no route caught (for example a broken JSON body)
app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Request body is not valid JSON" });
  }

  console.error(error.message);
  res.status(500).json({ message: "Something went wrong on the server" });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
