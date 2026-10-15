import moment from "moment-timezone";

const TIMEZONE = "Asia/Jakarta";

const CANONICAL_ORDER = [
  "Coffee",
  "Non-Coffee",
  "Food",
  "Beverage",
  "Snack",
  "Add-Ons",
  "Court",
  "Other"
];

const getCategoryRank = (cat) => {
  const idx = CANONICAL_ORDER.findIndex(c => c.toLowerCase() === (cat || "").toLowerCase());
  return idx !== -1 ? idx : 50;
};

export const normalizeCategory = (cat) => {
  if (!cat) return "Other";
  const trimmed = cat.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "coffee") return "Coffee";
  if (lower === "non-coffee" || lower === "non coffee" || lower === "noncoffee") return "Non-Coffee";
  if (lower === "food" || lower === "foods") return "Food";
  if (lower === "beverage" || lower === "beverages" || lower === "drink" || lower === "drinks") return "Beverage";
  if (lower === "snack" || lower === "snacks") return "Snack";
  if (lower === "add-ons" || lower === "add-on" || lower === "addons" || lower === "addon") return "Add-Ons";
  if (lower === "court" || lower === "lapangan") return "Court";
  return trimmed.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
};

export const fetchSettlementData = async (supabase, dateStr, categoryFilter = "ALL", storeProfile = null) => {
  const start = moment.tz(`${dateStr}T00:00:00.000`, TIMEZONE).toISOString();
  const end = moment.tz(`${dateStr}T23:59:59.999`, TIMEZONE).toISOString();

  // 1. Fetch menu mapping
  const { data: menuData, error: menuErr } = await supabase
    .from("menu")
    .select("menu_id, name, category, price");
  if (menuErr) throw menuErr;

  const menuMap = {};
  const menuNameMap = {};
  (menuData || []).forEach(m => {
    menuMap[m.menu_id] = m;
    if (m.name) menuNameMap[m.name.trim().toLowerCase()] = m;
  });

  const isItemCourt = (item, cleanName) => {
    const m = menuMap[item.menu_id];
    if (m?.category && m.category.toLowerCase() === "court") return true;
    const name = (cleanName || item.menu_name || "").toLowerCase();
    if (name.includes("court") || name.includes("lapangan") || name.includes("padel")) return true;
    return false;
  };

  const getItemCategory = (item, cleanName) => {
    const m = menuMap[item.menu_id];
    let cat = m?.category;
    if (!cat || cat === "Unknown") {
      const byName = menuNameMap[cleanName.trim().toLowerCase()];
      if (byName?.category) cat = byName.category;
    }
    if (!cat || cat === "Unknown") {
      if (isItemCourt(item, cleanName)) {
        cat = "Court";
      } else {
        cat = "Other";
      }
    }
    return normalizeCategory(cat);
  };

  // 2. Fetch transactions for selected business date
  const { data: txs, error: txErr } = await supabase
    .from("transactions")
    .select("*, transaction_items(*)")
    .gte("date", start)
    .lte("date", end)
    .not("status", "eq", "REFUND")
    .not("status", "eq", "VOID")
    .order("date", { ascending: true });

  if (txErr) throw txErr;

  const itemAgg = {};
  const promoAgg = {};
  const pmAgg = {};
  let totalDiscount = 0;
  let grandTotal = 0;
  let matchedTxCount = 0;

  (txs || []).forEach(t => {
    const hasCourtItem = t.transaction_items?.some(i => {
      let clean = i.menu_name || "";
      if (clean.includes(" [")) clean = clean.split(" [")[0];
      if (clean.includes(" (Note:")) clean = clean.split(" (Note:")[0];
      return isItemCourt(i, clean);
    });
    const isCourtTx = t.table_no === "Court" || hasCourtItem;

    if (categoryFilter === "COURT" && !isCourtTx) return;
    if (categoryFilter === "CAFE" && isCourtTx) return;

    matchedTxCount += 1;
    grandTotal += Number(t.total_price || 0);
    totalDiscount += Number(t.discount || 0);

    // Promos / Discounts
    if (Number(t.discount) > 0) {
      let pName = "Diskon / Promo";
      if (t.notes) {
        try {
          const parsed = JSON.parse(t.notes);
          if (parsed && parsed.promo_name) pName = parsed.promo_name;
        } catch (e) {}
      } else if (t.payment_method === "Staff Beverage") {
        pName = "Staff Beverage";
      }
      if (!promoAgg[pName]) promoAgg[pName] = { name: pName, qty: 0, discount: 0 };
      promoAgg[pName].qty += 1;
      promoAgg[pName].discount += Number(t.discount);
    }

    // Payment Methods
    const rawPm = t.payment_method || "Other";
    if (rawPm.includes(" (Rp ")) {
      const parts = rawPm.split(", ");
      parts.forEach(part => {
        const match = part.match(/^(.*?)\s*\(Rp\s*([\d\.,]+)\)$/);
        if (match) {
          const name = match[1].trim();
          const amt = Number(match[2].replace(/\./g, "")) || 0;
          if (!pmAgg[name]) pmAgg[name] = { name, qty: 0, total: 0 };
          pmAgg[name].qty += 1;
          pmAgg[name].total += amt;
        } else {
          const name = part.split(" (Rp ")[0].trim();
          if (!pmAgg[name]) pmAgg[name] = { name, qty: 0, total: 0 };
          pmAgg[name].qty += 1;
          pmAgg[name].total += Number(t.total_price);
        }
      });
    } else {
      if (!pmAgg[rawPm]) pmAgg[rawPm] = { name: rawPm, qty: 0, total: 0 };
      pmAgg[rawPm].qty += 1;
      pmAgg[rawPm].total += Number(t.total_price);
    }

    // Items sold
    if (t.transaction_items) {
      t.transaction_items.forEach(item => {
        let cleanName = item.menu_name || "";
        if (cleanName.includes(" [")) cleanName = cleanName.split(" [")[0];
        if (cleanName.includes(" (Note:")) cleanName = cleanName.split(" (Note:")[0];

        const itemCategory = getItemCategory(item, cleanName);

        if (categoryFilter === "COURT" && itemCategory !== "Court") return;
        if (categoryFilter === "CAFE" && itemCategory === "Court") return;

        let parsedAddons = [];
        if (typeof item.addons === "string") {
          try { parsedAddons = JSON.parse(item.addons); } catch (e) {}
        } else {
          parsedAddons = item.addons || [];
        }

        let itemAddonsTotal = 0;
        if (parsedAddons && Array.isArray(parsedAddons)) {
          parsedAddons.forEach(addon => {
            const addonRev = Number(addon.price) * Number(item.qty);
            itemAddonsTotal += addonRev;
            if (categoryFilter === "ALL" || categoryFilter === "CAFE") {
              const aKey = `Add-Ons___${addon.name}`;
              if (!itemAgg[aKey]) {
                itemAgg[aKey] = { name: addon.name, category: "Add-Ons", qty: 0, total: 0 };
              }
              itemAgg[aKey].qty += Number(item.qty);
              itemAgg[aKey].total += addonRev;
            }
          });
        }

        const baseTotal = Number(item.subtotal) - itemAddonsTotal;
        const itemKey = `${itemCategory}___${cleanName}`;
        if (!itemAgg[itemKey]) {
          itemAgg[itemKey] = { name: cleanName, category: itemCategory, qty: 0, total: 0 };
        }
        itemAgg[itemKey].qty += Number(item.qty);
        itemAgg[itemKey].total += baseTotal;
      });
    }
  });

  const allAggregatedItems = Object.values(itemAgg);

  const groupsMap = {};
  allAggregatedItems.forEach(item => {
    const cat = item.category || "Other";
    if (!groupsMap[cat]) {
      groupsMap[cat] = {
        category: cat,
        items: [],
        totalQty: 0,
        subtotal: 0
      };
    }
    groupsMap[cat].items.push(item);
    groupsMap[cat].totalQty += item.qty;
    groupsMap[cat].subtotal += item.total;
  });

  const categoryGroups = Object.values(groupsMap).sort((a, b) => {
    const rankA = getCategoryRank(a.category);
    const rankB = getCategoryRank(b.category);
    if (rankA !== rankB) return rankA - rankB;
    return a.category.localeCompare(b.category);
  });

  categoryGroups.forEach(group => {
    group.items.sort((a, b) => b.qty - a.qty || b.total - a.total || a.name.localeCompare(b.name));
  });

  const items = categoryGroups.flatMap(g => g.items);
  const itemsSubtotal = categoryGroups.reduce((sum, g) => sum + g.subtotal, 0);
  const itemsTotalQty = categoryGroups.reduce((sum, g) => sum + g.totalQty, 0);

  const promos = Object.values(promoAgg);
  const totalPromoQty = promos.reduce((sum, p) => sum + p.qty, 0);
  const totalPromoDiscount = promos.reduce((sum, p) => sum + p.discount, 0);

  const paymentMethods = Object.values(pmAgg).sort((a, b) => b.total - a.total);
  const totalPaymentsQty = paymentMethods.reduce((sum, pm) => sum + pm.qty, 0);
  const totalPaymentsAmount = paymentMethods.reduce((sum, pm) => sum + pm.total, 0);

  let categoryHeader = "CAFE & COURT";
  if (categoryFilter === "CAFE") categoryHeader = "CAFE";
  if (categoryFilter === "COURT") categoryHeader = "COURT";

  const formattedDate = moment(dateStr).format("DD/MM/YYYY");

  return {
    storeProfile: storeProfile || { store_name: "ADA PADEL & COFFEE SHOP", address: "BSD City, Tangerang" },
    date: dateStr,
    formattedDate,
    categoryFilter,
    categoryHeader,
    matchedTxCount,
    categoryGroups,
    items,
    itemsSubtotal,
    itemsTotalQty,
    promos,
    totalPromoQty,
    totalPromoDiscount,
    paymentMethods,
    totalPaymentsQty,
    totalPaymentsAmount,
    totalTransactions: itemsSubtotal,
    totalDiscount,
    grandTotal: itemsSubtotal - totalDiscount
  };
};
