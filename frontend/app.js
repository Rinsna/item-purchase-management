
const message = document.getElementById("message");
let items = [];
let cart = [];

// set when an existing item type is being edited
let editingTypeId = null;
let editingTypeActive = true;

// set when an existing item is being edited
let editingItemId = null;

// set when an existing purchase is being edited
let editingPurchaseId = null;
let editingOldQuantities = {};

let messageTimer = null;

function showMessage(text, type = "success") {
  if (messageTimer) clearTimeout(messageTimer);
  message.textContent = text;
  message.className = type;

  // automatically dismiss after 4 seconds for a clean experience
  messageTimer = setTimeout(() => {
    message.className = "";
  }, 4000);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data.detail ? `${data.message} (${data.detail})` : (data.message || "Something went wrong");
    throw new Error(errorMsg);
  }

  return data;
}

// dropdown and list
async function loadTypes() {
  const types = await request("/api/item-types");
  const typeSelect = document.getElementById("itemType");

  typeSelect.replaceChildren(new Option("Select item type", ""));

  types.filter(type => type.is_active).forEach(type => {
    typeSelect.add(new Option(type.type_name, type.id));
  });

  const list = document.getElementById("typeList");
  list.replaceChildren();

  types.forEach(type => {
    const row = document.createElement("div");
    row.className = "item-row";

    const info = document.createElement("div");
    info.className = "item-row-info";

    const nameEl = document.createElement("strong");
    nameEl.textContent = type.type_name;

    const descEl = document.createElement("span");
    descEl.textContent = type.description ? `— ${type.description}` : "— No description";
    descEl.style.color = "#64748b";

    const badge = document.createElement("span");
    badge.className = `badge ${type.is_active ? "badge-active" : "badge-inactive"}`;
    badge.textContent = type.is_active ? "Active" : "Inactive";

    info.append(nameEl, descEl, badge);

    const btnGroup = document.createElement("div");
    btnGroup.className = "btn-group";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "btn-action btn-edit";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => startTypeEdit(type));

    const statusButton = document.createElement("button");
    statusButton.type = "button";
    statusButton.className = `btn-action ${type.is_active ? "btn-status-deactivate" : "btn-status-activate"}`;
    statusButton.textContent = type.is_active ? "Deactivate" : "Activate";
    statusButton.addEventListener("click", () => changeTypeStatus(type));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "btn-action btn-delete";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteType(type));

    btnGroup.append(editButton, statusButton, deleteButton);
    row.append(info, btnGroup);
    list.appendChild(row);
  });
}

// Create or update item type
document.getElementById("typeForm").addEventListener("submit", async event => {
  event.preventDefault();

  const isEditing = editingTypeId !== null;

  try {
    await request(isEditing ? `/api/item-types/${editingTypeId}` : "/api/item-types", {
      method: isEditing ? "PUT" : "POST",
      body: JSON.stringify({
        name: document.getElementById("typeName").value,
        description: document.getElementById("typeDescription").value,
        is_active: editingTypeActive
      })
    });

    resetTypeForm();
    showMessage(isEditing ? "Item type updated successfully" : "Item type added successfully");
    await loadTypes();
    await loadItems();
  } catch (error) {
    showMessage(error.message, "error");
  }
});

// put an item type into the form so it can be changed
function startTypeEdit(type) {
  editingTypeId = type.id;
  editingTypeActive = Boolean(type.is_active);

  document.getElementById("typeName").value = type.type_name;
  document.getElementById("typeDescription").value = type.description || "";
  document.getElementById("saveType").textContent = "Update Item Type";
  document.getElementById("cancelTypeEdit").hidden = false;
  document.getElementById("typeForm").scrollIntoView({ behavior: "smooth" });
  showMessage(`Editing ${type.type_name}. Change the fields and press Update Item Type.`, "info");
}

function resetTypeForm() {
  editingTypeId = null;
  editingTypeActive = true;
  document.getElementById("typeForm").reset();
  document.getElementById("saveType").textContent = "Add Item Type";
  document.getElementById("cancelTypeEdit").hidden = true;
}

document.getElementById("cancelTypeEdit").addEventListener("click", () => {
  resetTypeForm();
  showMessage("Edit cancelled", "info");
});

// turn an item type on or off without changing anything else
async function changeTypeStatus(type) {
  try {
    await request(`/api/item-types/${type.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: type.type_name,
        description: type.description,
        is_active: !type.is_active
      })
    });

    showMessage(`${type.type_name} is now ${type.is_active ? "inactive" : "active"}`);
    await loadTypes();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function deleteType(type) {
  if (!confirm(`Delete ${type.type_name}?`)) {
    return;
  }

  try {
    const result = await request(`/api/item-types/${type.id}`, { method: "DELETE" });

    // a type that already has items is only made inactive by the server
    showMessage(result.message, result.deleted ? "success" : "info");
    await loadTypes();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

// Load inventory and purchase dropdown
async function loadItems() {
  items = await request("/api/items");

  const list = document.getElementById("itemList");
  const purchaseSelect = document.getElementById("purchaseItem");

  list.replaceChildren();
  purchaseSelect.replaceChildren(new Option("Select item", ""));

  items.forEach(item => {
    const row = document.createElement("tr");
    const availability = getAvailability(item.stock_available);

    [
      item.id,
      item.name,
      item.item_type_name,
      item.purchase_date.slice(0, 10),
      Number(item.price).toFixed(2),
      item.stock_available,
      availability.text,
      item.active ? "Active" : "Inactive"
    ].forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value ?? "";

      // colour the availability and status columns
      if (index === 6) cell.className = availability.className;
      if (index === 7) cell.className = item.active ? "in-stock" : "out-of-stock";

      row.appendChild(cell);
    });

    row.appendChild(makeItemButtons(item));
    list.appendChild(row);

    // only active items with stock can go into a new purchase
    // (while editing, items already in that purchase stay in the list)
    const canBuy = item.active && item.stock_available > 0;
    if (canBuy || (item.active && editingOldQuantities[item.id])) {
      purchaseSelect.add(
        new Option(`${item.name} (Stock: ${item.stock_available})`, item.id)
      );
    }
  });
}

function getAvailability(stock) {
  if (stock === 0) return { text: "Out of Stock", className: "out-of-stock" };
  if (stock <= 5) return { text: "Low Stock", className: "low-stock" };
  return { text: "In Stock", className: "in-stock" };
}

// the action buttons at the end of each item row
function makeItemButtons(item) {
  const cell = document.createElement("td");
  const group = document.createElement("div");
  group.className = "btn-group";

  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "btn-action btn-view";
  viewButton.textContent = "View";
  viewButton.addEventListener("click", () => viewItem(item.id));

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "btn-action btn-edit";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => startItemEdit(item));

  const statusButton = document.createElement("button");
  statusButton.type = "button";
  statusButton.className = `btn-action ${item.active ? "btn-status-deactivate" : "btn-status-activate"}`;
  statusButton.textContent = item.active ? "Deactivate" : "Activate";
  statusButton.addEventListener("click", () => changeItemStatus(item));

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "btn-action btn-delete";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => deleteItem(item));

  group.append(viewButton, editButton, statusButton, deleteButton);
  cell.appendChild(group);
  return cell;
}

async function viewItem(id) {
  try {
    const item = await request(`/api/items/${id}`);
    const status = item.active ? "Active" : "Inactive";

    showMessage(
      `${item.name} | Type: ${item.item_type_name} | Price: ₹${Number(item.price).toFixed(2)} | ` +
      `Stock: ${item.stock_available} | Purchase date: ${item.purchase_date.slice(0, 10)} | ` +
      `Status: ${status}` +
      (item.description ? ` | ${item.description}` : ""),
      "info"
    );
  } catch (error) {
    showMessage(error.message, "error");
  }
}

// turn an item on or off without changing anything else
async function changeItemStatus(item) {
  try {
    await request(`/api/items/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: item.name,
        description: item.description,
        item_type_id: item.item_type_id,
        purchase_date: item.purchase_date.slice(0, 10),
        price: Number(item.price),
        stock_available: item.stock_available,
        active: !item.active
      })
    });

    showMessage(`${item.name} is now ${item.active ? "inactive" : "active"}`);
    await loadItems();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function deleteItem(item) {
  if (!confirm(`Delete ${item.name}?`)) {
    return;
  }

  try {
    const result = await request(`/api/items/${item.id}`, { method: "DELETE" });

    // an item that was already purchased is only made inactive by the server
    showMessage(result.message, result.deleted ? "success" : "info");
    await loadItems();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

// put an item into the form so it can be changed
function startItemEdit(item) {
  editingItemId = item.id;

  document.getElementById("itemName").value = item.name;
  document.getElementById("itemDescription").value = item.description || "";
  document.getElementById("itemType").value = item.item_type_id;
  document.getElementById("itemDate").value = item.purchase_date.slice(0, 10);
  document.getElementById("itemPrice").value = item.price;
  document.getElementById("itemStock").value = item.stock_available;
  document.getElementById("itemActive").value = item.active ? "1" : "0";

  document.getElementById("saveItem").textContent = "Update Item";
  document.getElementById("cancelItemEdit").hidden = false;
  document.getElementById("itemForm").scrollIntoView({ behavior: "smooth" });
  showMessage(`Editing ${item.name}. Change the fields and press Update Item.`, "info");
}

function resetItemForm() {
  editingItemId = null;
  document.getElementById("itemForm").reset();
  document.getElementById("saveItem").textContent = "Add Item";
  document.getElementById("cancelItemEdit").hidden = true;
}

document.getElementById("cancelItemEdit").addEventListener("click", () => {
  resetItemForm();
  showMessage("Edit cancelled", "info");
});

// Create or update item
document.getElementById("itemForm").addEventListener("submit", async event => {
  event.preventDefault();

  const isEditing = editingItemId !== null;

  try {
    await request(isEditing ? `/api/items/${editingItemId}` : "/api/items", {
      method: isEditing ? "PUT" : "POST",
      body: JSON.stringify({
        name: document.getElementById("itemName").value,
        description: document.getElementById("itemDescription").value,
        purchase_date: document.getElementById("itemDate").value,
        item_type_id: Number(document.getElementById("itemType").value),
        price: Number(document.getElementById("itemPrice").value),
        stock_available: Number(document.getElementById("itemStock").value),
        active: document.getElementById("itemActive").value === "1"
      })
    });

    resetItemForm();
    showMessage(isEditing ? "Item updated successfully" : "Item added successfully");
    await loadItems();
  } catch (error) {
    showMessage(error.message, "error");
  }
});

// Add an item to the purchase cart
document.getElementById("addPurchaseItem").addEventListener("click", () => {
  const id = Number(document.getElementById("purchaseItem").value);
  const quantity = Number(document.getElementById("purchaseQuantity").value);
  const item = items.find(item => Number(item.id) === id);

  if (!item || !Number.isInteger(quantity) || quantity < 1) {
    showMessage("Select an item and enter a valid quantity", "error");
    return;
  }

  // when editing, the units already in this purchase can be used again
  const available = Number(item.stock_available) + (editingOldQuantities[id] || 0);

  if (available <= 0) {
    showMessage(`Out of stock: ${item.name} is currently unavailable`, "error");
    return;
  }

  if (quantity > available) {
    showMessage(`Insufficient stock for ${item.name}. Available: ${available}`, "error");
    return;
  }

  // if the item is already in the cart, replace its quantity
  const existing = cart.find(line => line.item_id === id);

  if (existing) {
    existing.quantity = quantity;
  } else {
    cart.push({
      item_id: id,
      name: item.name,
      price: Number(item.price),
      quantity
    });
  }

  renderCart();
  showMessage(`${item.name} quantity set to ${quantity}`);
});

function renderCart() {
  const list = document.getElementById("cartList");
  list.replaceChildren();

  let total = 0;

  cart.forEach(line => {
    total += line.price * line.quantity;

    const li = document.createElement("li");
    li.textContent =
      `${line.name} × ${line.quantity} = ₹${(line.price * line.quantity).toFixed(2)} `;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";

    removeButton.addEventListener("click", () => {
      cart = cart.filter(item => item.item_id !== line.item_id);
      renderCart();
    });

    li.appendChild(removeButton);
    list.appendChild(li);
  });

  document.getElementById("cartTotal").textContent =
    `Total: ₹${total.toFixed(2)}`;
}

// Save purchase
document.getElementById("purchaseForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!cart.length) {
    showMessage("Add at least one item first", "error");
    return;
  }

  const isEditing = editingPurchaseId !== null;

  try {
    const result = await request(
      isEditing ? `/api/purchases/${editingPurchaseId}` : "/api/purchases",
      {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify({
          items: cart.map(line => ({
            item_id: line.item_id,
            quantity: line.quantity
          })),
          purchase_date: document.getElementById("purchaseDate").value,
          notes: document.getElementById("purchaseNotes").value
        })
      }
    );

    resetPurchaseForm();

    showMessage(
      `${isEditing ? "Purchase updated" : "Purchase saved"}. ` +
      `Total: ₹${Number(result.total_amount).toFixed(2)}`
    );

    await loadItems();
    await loadPurchases();
  } catch (error) {
    showMessage(error.message, "error");
  }
});

// clear the form and go back to "new purchase" mode
function resetPurchaseForm() {
  editingPurchaseId = null;
  editingOldQuantities = {};
  cart = [];

  document.getElementById("purchaseForm").reset();
  document.getElementById("savePurchase").textContent = "Save Purchase";
  document.getElementById("cancelEdit").hidden = true;
  renderCart();
}

document.getElementById("cancelEdit").addEventListener("click", async () => {
  resetPurchaseForm();
  await loadItems();
  showMessage("Edit cancelled", "info");
});

// put an old purchase into the form so it can be changed
async function startEditing(purchase) {
  try {
    const details = await request(`/api/purchases/${purchase.id}`);
    const lines = details.filter(line => line.item_id);

    editingPurchaseId = purchase.id;
    editingOldQuantities = {};
    cart = [];

    lines.forEach(line => {
      editingOldQuantities[line.item_id] = line.quantity;
      cart.push({
        item_id: line.item_id,
        name: line.item_name,
        price: Number(line.unit_price),
        quantity: line.quantity
      });
    });

    document.getElementById("purchaseDate").value = purchase.purchase_date.slice(0, 10);
    document.getElementById("purchaseNotes").value = purchase.notes || "";
    document.getElementById("savePurchase").textContent = "Update Purchase";
    document.getElementById("cancelEdit").hidden = false;

    await loadItems();
    renderCart();
    document.getElementById("purchaseForm").scrollIntoView({ behavior: "smooth" });
    showMessage(`Editing ${purchase.order_id}. Change the items and press Update Purchase.`, "info");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

// Purchase history
async function loadPurchases() {
  try {
    const purchases = await request("/api/purchases");
    const list = document.getElementById("purchaseList");

    list.replaceChildren();

    if (!purchases.length) {
      list.textContent = "No purchases yet.";
      return;
    }

    purchases.forEach(purchase => {
      const row = document.createElement("div");
      row.className = "item-row";

      const info = document.createElement("div");
      info.className = "item-row-info";

      const orderEl = document.createElement("strong");
      orderEl.textContent = purchase.order_id;

      const dateEl = document.createElement("span");
      dateEl.textContent = `• ${purchase.purchase_date.slice(0, 10)}`;
      dateEl.style.color = "#64748b";

      const totalEl = document.createElement("span");
      totalEl.innerHTML = `• Total: <strong>₹${Number(purchase.total_amount).toFixed(2)}</strong>`;

      const linesBadge = document.createElement("span");
      linesBadge.className = "badge";
      linesBadge.style.background = "#e2e8f0";
      linesBadge.style.color = "#334155";
      linesBadge.textContent = `${purchase.line_count} ${purchase.line_count === 1 ? "item" : "items"}`;

      info.append(orderEl, dateEl, totalEl, linesBadge);

      const btnGroup = document.createElement("div");
      btnGroup.className = "btn-group";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn-action btn-view";
      button.textContent = "View details";
      button.addEventListener("click", () => showPurchaseDetails(purchase.id));

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "btn-action btn-edit";
      editButton.textContent = "Update";
      editButton.addEventListener("click", () => startEditing(purchase));

      btnGroup.append(button, editButton);
      row.append(info, btnGroup);
      list.appendChild(row);
    });
  } catch (error) {
    showMessage(error.message, "error");
  }
}

document.getElementById("refreshPurchases").addEventListener("click", loadPurchases);

// Purchase details: order id, date, every item with its type, quantity and stock
async function showPurchaseDetails(id) {
  try {
    const rows = await request(`/api/purchases/${id}`);
    const first = rows[0];
    const lines = rows.filter(row => row.item_id);

    document.getElementById("detailsTitle").textContent = `Purchase Details - ${first.order_id}`;
    document.getElementById("detailsInfo").textContent =
      `Order ID: ${first.order_id} | Purchase date: ${first.purchase_date.slice(0, 10)}` +
      (first.notes ? ` | Notes: ${first.notes}` : "");

    const body = document.getElementById("detailsBody");
    body.replaceChildren();

    lines.forEach(line => {
      const row = document.createElement("tr");

      [
        line.item_name,
        line.type_name,
        line.quantity,
        `₹${Number(line.unit_price).toFixed(2)}`,
        `₹${Number(line.line_total).toFixed(2)}`,
        line.stock_available
      ].forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value ?? "";
        row.appendChild(cell);
      });

      body.appendChild(row);
    });

    document.getElementById("detailsTotal").textContent =
      `Total: ₹${Number(first.total_amount).toFixed(2)}`;

    const section = document.getElementById("purchaseDetails");
    section.hidden = false;
    section.scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    showMessage(error.message, "error");
  }
}

document.getElementById("closeDetails").addEventListener("click", () => {
  document.getElementById("purchaseDetails").hidden = true;
});

// Start the page
async function startApp() {
  try {
    await loadTypes();
    await loadItems();
    await loadPurchases();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

startApp();
