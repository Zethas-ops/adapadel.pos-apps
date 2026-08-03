import React, { useState, useEffect, useRef } from "react";
import { Plus, Minus, Trash2, Search, X, Check, ShoppingBag } from "lucide-react";
import { clsx } from "clsx";
import { useLocation } from "react-router-dom";
import moment from "moment-timezone";
import { supabase } from "../lib/supabase";
import { printViaBluetooth, formatReceiptText } from "../utils/printer";

const TIMEZONE = 'Asia/Jakarta';

function POS() {
  const location = useLocation();
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [storeProfile, setStoreProfile] = useState(null);
  const [promos, setPromos] = useState([]);
  const [ppnRate, setPpnRate] = useState(0.11);
  const [paymentMethodsList, setPaymentMethodsList] = useState([]);
  const [cart, setCart] = useState([]);
  const [tableNo, setTableNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [openBillId, setOpenBillId] = useState(null);
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [showOptions, setShowOptions] = useState(false);
  const [qty, setQty] = useState(1);
  const [drinkType, setDrinkType] = useState("Ice");
  const [sugarLevel, setSugarLevel] = useState("Normal");
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [itemNote, setItemNote] = useState("");
  const [transactionNote, setTransactionNote] = useState("");
  const [selectedPromoId, setSelectedPromoId] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [splitPayments, setSplitPayments] = useState([]);
  const [cashAmount, setCashAmount] = useState("");
  const [qrisData, setQrisData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);

  const getSufficientPayment = () => {
    if (paymentMethod === "Split Payment") {
      const totalSplit = splitPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      return totalSplit >= totalCart;
    }
    if (paymentMethod === "Cash") {
      return parseFloat(cashAmount) >= totalCart;
    }
    return true;
  };

  useEffect(() => {
    fetchData();
  },[]);
  useEffect(() => {
    if (location.state?.bill) {
      const bill = location.state.bill;
      let loadTableNo = bill.table_no;
      if (loadTableNo && loadTableNo.includes('|PROMO:')) {
        const parts = loadTableNo.split('|PROMO:');
        loadTableNo = parts[0];
        setSelectedPromoId(parts[1]);
      }
      setTableNo(loadTableNo);
      setCustomerName(bill.customer_name);
      setOpenBillId(bill.bill_id);
      
      const parsedItems = bill.items.map((item) => {
        let parsedAddons = [];
        if (typeof item.addons === "string") {
          try {
            parsedAddons = JSON.parse(item.addons);
          } catch (e) {
            console.error("Error parsing addons:", e);
          }
        } else {
          parsedAddons = item.addons || [];
        }
        return {
          ...item,
          addons: parsedAddons
        };
      });
      setCart(parsedItems);
      if (location.state.action === "close") {
        setShowPayment(true);
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);
  const isPromoValid = (promo) => {
    if (!promo.is_active) return false;
    const now = moment().tz(TIMEZONE);
    if (promo.start_date && promo.end_date) {
      const start = moment.utc(promo.start_date).tz(TIMEZONE).startOf('day');
      const end = moment.utc(promo.end_date).tz(TIMEZONE).endOf('day');
      if (now.isBefore(start) || now.isAfter(end)) return false;
    }
    if (promo.day_filter && promo.day_filter !== "All Days") {
      const day = now.day();
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const currentDayName = dayNames[day];
      if (promo.day_filter === "Weekdays" && (day === 0 || day === 6)) return false;
      if (promo.day_filter === "Weekends" && (day > 0 && day < 6)) return false;
      if (["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].includes(promo.day_filter)) {
        if (promo.day_filter !== currentDayName) return false;
      }
    }
    if (promo.time_filter && promo.time_filter !== "All Day") {
      const hour = now.hours();
      const minute = now.minutes();
      const currentMinutes = hour * 60 + minute;
      if (promo.time_filter === "Morning (06:00 - 12:00)") {
        if (currentMinutes < 6 * 60 || currentMinutes > 12 * 60) return false;
      } else if (promo.time_filter === "Afternoon (12:00 - 18:00)") {
        if (currentMinutes < 12 * 60 || currentMinutes > 18 * 60) return false;
      } else if (promo.time_filter === "Evening (18:00 - 24:00)") {
        if (currentMinutes < 18 * 60 || currentMinutes > 24 * 60) return false;
      } else if (promo.time_filter.startsWith("Custom Time")) {
        const match = promo.time_filter.match(/Custom Time \((\d{2}):(\d{2}) - (\d{2}):(\d{2})\)/);
        if (match) {
          const startMinutes = parseInt(match[1]) * 60 + parseInt(match[2]);
          const endMinutes = parseInt(match[3]) * 60 + parseInt(match[4]);
          if (currentMinutes < startMinutes || currentMinutes > endMinutes) return false;
        }
      }
    }
    return true;
  };
  useEffect(() => {
    if (menu.length === 0 || promos.length === 0) return;
    const requiredFreeItems = {};
    const nonFreeCart = cart.filter((item) => !item.is_auto_free);
    const subtotal = nonFreeCart.reduce((sum, item) => sum + item.subtotal, 0);
    
    if (selectedPromoId) {
      const promo = promos.find(p => p.promo_id.toString() === selectedPromoId && isPromoValid(p));
      if (promo) {
        if (promo.type === "MIN_BUY_FREE") {
          const buyItems = nonFreeCart.filter((item) => item.menu_id === Number(promo.min_buy_menu_id));
          const totalBuyQty = buyItems.reduce((sum, item) => sum + item.qty, 0);
          const minBuyQty = Number(promo.min_buy_qty);
          if (minBuyQty > 0 && totalBuyQty >= minBuyQty) {
            const timesApplied = Math.floor(totalBuyQty / minBuyQty);
            const freeQty = timesApplied * Number(promo.free_qty);
            if (freeQty > 0) {
              requiredFreeItems[promo.free_menu_id] = (requiredFreeItems[promo.free_menu_id] || 0) + freeQty;
            }
          }
        } else if (promo.type === "MIN_NOMINAL_FREE" && promo.free_menu_id) {
          if (subtotal >= Number(promo.min_nominal)) {
            requiredFreeItems[promo.free_menu_id] = (requiredFreeItems[promo.free_menu_id] || 0) + 1;
          }
        }
      }
    }
        
    // Cap requiredFreeItems by available stock using nonFreeCart
    let cappedFreeItems = {};
    const tempCart = [...nonFreeCart]; // Simulate adding free items to evaluate stock
    Object.keys(requiredFreeItems).forEach(menuIdStr => {
      const menuId = parseInt(menuIdStr);
      const menuItem = menu.find(m => m.menu_id === menuId);
      if (menuItem) {
        const availableQty = getMenuMaxQty(menuItem, tempCart);
        const cappedQty = Math.min(requiredFreeItems[menuId], availableQty);
        if (cappedQty > 0) {
          cappedFreeItems[menuIdStr] = cappedQty;
          // Add to tempCart so subsequent free items take stock into account properly if they share ingredients
          tempCart.push({
            menu_id: menuItem.menu_id,
            qty: cappedQty
          });
        }
      }
    });

    const currentAutoFreeItems = cart.filter((item) => item.is_auto_free);
    const currentAutoMap = {};
    currentAutoFreeItems.forEach((item) => {
      currentAutoMap[item.menu_id] = (currentAutoMap[item.menu_id] || 0) + item.qty;
    });

    let isDifferent = false;
    if (Object.keys(cappedFreeItems).length !== Object.keys(currentAutoMap).length) {
      isDifferent = true;
    } else {
      for (const key in cappedFreeItems) {
        if (cappedFreeItems[key] !== currentAutoMap[key]) {
          isDifferent = true;
          break;
        }
      }
    }
    if (isDifferent) {
      const newCart = [...nonFreeCart];
      Object.keys(cappedFreeItems).forEach((menuIdStr) => {
        const menuId = parseInt(menuIdStr);
        const qty2 = cappedFreeItems[menuId];
        const menuItem = menu.find((m) => m.menu_id === menuId);
        if (menuItem) {
          newCart.push({
            menu_id: menuItem.menu_id,
            menu_name: menuItem.name + " (FREE)",
            price: 0,
            qty: qty2,
            drink_type: null,
            sugar_level: null,
            addons: [],
            subtotal: 0,
            is_auto_free: true
          });
        }
      });
      setCart(newCart);
    }
  }, [cart, promos, menu, selectedPromoId]);
  const fetchData = async () => {
    try {
      const [menuRes, profileRes, promoRes, recipesRes, ingredientsRes, addonsRes, settingsRes, paymentMethodsRes] = await Promise.all([
        supabase.from('menu').select('*'),
        supabase.from('store_profile').select('*').single(),
        supabase.from('promotions').select('*'),
        supabase.from('recipes').select('*'),
        supabase.from('ingredients').select('*'),
        supabase.from('menu_addons').select('*'),
        supabase.from('settings').select('*'),
        supabase.from('payment_methods').select('*').eq('is_active', true)
      ]);

      if (menuRes.error) throw menuRes.error;
      
      const ingredientsMap = {};
      if (ingredientsRes.data) {
        ingredientsRes.data.forEach(ing => {
          ingredientsMap[ing.ingredient_id] = ing.current_stock;
        });
      }

      const menuData = menuRes.data.map(item => {
        let image = item.image;
        let addon_target = item.addon_target;
        if (addon_target && addon_target.includes('|||')) {
          const parts = addon_target.split('|||');
          addon_target = parts[0] || null;
          image = parts[1];
        }

        const itemRecipes = recipesRes.data?.filter(r => r.menu_id === item.menu_id) || [];
        const recipesWithStock = itemRecipes.map(r => ({
          ...r,
          current_stock: ingredientsMap[r.ingredient_id] || 0
        }));
        
        let maxQty = Infinity;
        if (recipesWithStock.length > 0) {
          for (const r of recipesWithStock) {
            const possible = Math.floor(r.current_stock / r.usage_amount);
            if (possible < maxQty) maxQty = possible;
          }
        } else {
          maxQty = 999; // If no recipes, assume unlimited
        }

        return {
          ...item,
          image,
          addon_target,
          recipes: recipesWithStock,
          maxQty: maxQty
        };
      });

      const menuDataWithAddons = menuData.map(item => {
        const addonIds = addonsRes.data?.filter(a => a.menu_id === item.menu_id).map(a => a.addon_menu_id) || [];
        const itemAddons = menuData.filter(m => addonIds.includes(m.menu_id));
        return {
          ...item,
          addons: itemAddons
        };
      });

      menuDataWithAddons.sort((a, b) => a.name.localeCompare(b.name));
      setMenu(menuDataWithAddons);
      const cats = Array.from(new Set(menuDataWithAddons.map((item) => item.category))).filter(c => c && c.toLowerCase() !== "add-ons" && c.toLowerCase() !== "addons");
      const categoryOrder = ["Coffee", "Non-Coffee", "Food", "Beverage"];
      cats.sort((a, b) => {
        const indexA = categoryOrder.indexOf(a);
        const indexB = categoryOrder.indexOf(b);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b);
      });
      setCategories(["All", ...cats]);
      
      if (!profileRes.error && profileRes.data) {
        setStoreProfile(profileRes.data);
      }
      if (!promoRes.error && promoRes.data) {
        setPromos(promoRes.data);
      }
      if (!settingsRes.error && settingsRes.data) {
        const ppnSetting = settingsRes.data.find(s => s.setting_key === 'PPN');
        if (ppnSetting && ppnSetting.is_active) {
          setPpnRate(Number(ppnSetting.setting_value) / 100);
        } else {
          setPpnRate(0);
        }
      }
      if (!paymentMethodsRes.error && paymentMethodsRes.data) {
        setPaymentMethodsList(paymentMethodsRes.data);
      } else {
        setPaymentMethodsList([{ id: 1, name: 'Cash' }]);
      }
    } catch (err) {
      console.error("Error fetching data", err);
    }
  };
  const handleMenuClick = (item) => {
    setSelectedMenu(item);
    setQty(1);
    setDrinkType("Ice");
    setSugarLevel("Normal");
    setSelectedAddons([]);
    setItemNote("");
    setShowOptions(true);
  };
  const getCartIngredientUsage = (cartItems = cart) => {
    const usage = {};
    for (const item of cartItems) {
      const menuItem = menu.find(m => m.menu_id === item.menu_id);
      if (menuItem && menuItem.recipes) {
        for (const r of menuItem.recipes) {
          usage[r.ingredient_id] = (usage[r.ingredient_id] || 0) + (r.usage_amount * item.qty);
        }
      }
      if (item.addons) {
        for (const addon of item.addons) {
          const addonMenu = menu.find(m => m.menu_id === addon.menu_id);
          if (addonMenu && addonMenu.recipes) {
            for (const r of addonMenu.recipes) {
              usage[r.ingredient_id] = (usage[r.ingredient_id] || 0) + (r.usage_amount * item.qty);
            }
          }
        }
      }
    }
    return usage;
  };

  const getMaxAllowedQty = () => {
    if (!selectedMenu) return 1;
    const cartUsage = getCartIngredientUsage();
    let minQty = Infinity;
    const ingredientUsage = {};
    if (selectedMenu.recipes) {
      for (const r of selectedMenu.recipes) {
        ingredientUsage[r.ingredient_id] = {
          stock: r.current_stock - (cartUsage[r.ingredient_id] || 0),
          usagePerItem: r.usage_amount
        };
      }
    }
    for (const addon of selectedAddons) {
      if (addon.recipes) {
        for (const r of addon.recipes) {
          if (!ingredientUsage[r.ingredient_id]) {
            ingredientUsage[r.ingredient_id] = {
              stock: r.current_stock - (cartUsage[r.ingredient_id] || 0),
              usagePerItem: 0
            };
          }
          ingredientUsage[r.ingredient_id].usagePerItem += r.usage_amount;
        }
      }
    }
    for (const id in ingredientUsage) {
      const { stock, usagePerItem } = ingredientUsage[id];
      if (usagePerItem > 0) {
        const possible = Math.floor(stock / usagePerItem);
        if (possible < minQty) minQty = possible;
      }
    }
    if (minQty === Infinity) minQty = 999;
    return Math.max(0, minQty);
  };
  const isAddonOutOfStock = (addon) => {
    if (!selectedMenu) return true;
    const cartUsage = getCartIngredientUsage();
    const ingredientUsage = {};
    if (selectedMenu.recipes) {
      for (const r of selectedMenu.recipes) {
        ingredientUsage[r.ingredient_id] = {
          stock: r.current_stock - (cartUsage[r.ingredient_id] || 0),
          usagePerItem: r.usage_amount
        };
      }
    }
    for (const a of selectedAddons) {
      if (a.menu_id === addon.menu_id) continue;
      if (a.recipes) {
        for (const r of a.recipes) {
          if (!ingredientUsage[r.ingredient_id]) {
            ingredientUsage[r.ingredient_id] = {
              stock: r.current_stock - (cartUsage[r.ingredient_id] || 0),
              usagePerItem: 0
            };
          }
          ingredientUsage[r.ingredient_id].usagePerItem += r.usage_amount;
        }
      }
    }
    if (addon.recipes) {
      for (const r of addon.recipes) {
        if (!ingredientUsage[r.ingredient_id]) {
          ingredientUsage[r.ingredient_id] = {
            stock: r.current_stock - (cartUsage[r.ingredient_id] || 0),
            usagePerItem: 0
          };
        }
        ingredientUsage[r.ingredient_id].usagePerItem += r.usage_amount;
      }
    }
    for (const id in ingredientUsage) {
      const { stock, usagePerItem } = ingredientUsage[id];
      if (usagePerItem > 0) {
        const possible = Math.floor(stock / usagePerItem);
        if (possible < qty) return true;
      }
    }
    return false;
  };
  const handleAddToCart = () => {
    if (!selectedMenu) return;
    const price = selectedMenu.price;
    const addonsPrice = selectedAddons.reduce((sum, a) => sum + a.price, 0);
    const subtotal = (price + addonsPrice) * qty;
    const newItem = {
      menu_id: selectedMenu.menu_id,
      menu_name: selectedMenu.name,
      price,
      qty,
      drink_type: selectedMenu.category === "Coffee" || selectedMenu.category === "Non Coffee" ? drinkType : null,
      sugar_level: selectedMenu.category === "Coffee" || selectedMenu.category === "Non Coffee" ? sugarLevel : null,
      addons: selectedAddons,
      note: itemNote.trim(),
      subtotal,
      maxQty: getMaxAllowedQty()
    };
    const existingIndex = cart.findIndex(
      (item) => item.menu_id === newItem.menu_id && item.drink_type === newItem.drink_type && item.sugar_level === newItem.sugar_level && JSON.stringify(item.addons) === JSON.stringify(newItem.addons) && (item.note || "") === newItem.note && !(item.is_auto_free)
    );
    if (existingIndex >= 0) {
      const newCart = [...cart];
      if (newCart[existingIndex].qty + qty > (newCart[existingIndex].maxQty || Infinity)) {
        alert("Cannot exceed available stock");
        return;
      }
      newCart[existingIndex].qty += qty;
      newCart[existingIndex].subtotal = (newCart[existingIndex].price + addonsPrice) * newCart[existingIndex].qty;
      setCart(newCart);
    } else {
      setCart([...cart, newItem]);
    }
    setShowOptions(false);
  };
  const updateCartQty = (index, delta) => {
    const newCart = [...cart];
    const newQty = newCart[index].qty + delta;
    if (newQty > (newCart[index].maxQty || Infinity)) {
      alert("Cannot exceed available stock");
      return;
    }
    newCart[index].qty = newQty;
    if (newCart[index].qty <= 0) {
      newCart.splice(index, 1);
    } else {
      const addonsPrice = newCart[index].addons.reduce((sum, a) => sum + a.price, 0);
      newCart[index].subtotal = (newCart[index].price + addonsPrice) * newCart[index].qty;
    }
    setCart(newCart);
  };
  const calculateTotals = () => {
    let subtotal = cart.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    let discount = 0;
    
    if (selectedPromoId) {
      const promo = promos.find(p => p.promo_id.toString() === selectedPromoId && isPromoValid(p));
      if (promo) {
        if (promo.type === "DISCOUNT") {
          discount = subtotal * (Number(promo.discount_percent) / 100);
        } else if (promo.type === "MIN_BUY_DISCOUNT") {
          let eligibleQty = 0;
          if (promo.min_buy_menu_id) {
            const buyItems = cart.filter(i => i.menu_id === Number(promo.min_buy_menu_id));
            eligibleQty = buyItems.reduce((sum, item) => sum + item.qty, 0);
          } else {
            eligibleQty = cart.reduce((sum, item) => sum + item.qty, 0);
          }
          
          if (eligibleQty >= Number(promo.min_buy_qty)) {
            const timesApplied = Math.floor(eligibleQty / Number(promo.min_buy_qty));
            
            if (promo.free_menu_id) {
              const discountItems = cart.filter(i => i.menu_id === Number(promo.free_menu_id));
              const availableQty = discountItems.reduce((sum, item) => sum + item.qty, 0);
              
              if (availableQty > 0) {
                const maxDiscountQty = promo.free_qty ? Number(promo.free_qty) * timesApplied : availableQty;
                const actualDiscountQty = Math.min(availableQty, maxDiscountQty);
                
                const discountItemsSubtotal = discountItems.reduce((sum, item) => sum + item.subtotal, 0);
                const discountableSubtotal = (discountItemsSubtotal / availableQty) * actualDiscountQty;
                
                if (promo.discount_amount) {
                  discount = Number(promo.discount_amount) * (promo.free_qty ? actualDiscountQty : timesApplied);
                } else if (promo.discount_percent) {
                  discount = discountableSubtotal * (Number(promo.discount_percent) / 100);
                }
              }
            } else {
              if (promo.discount_amount) {
                discount = Number(promo.discount_amount) * timesApplied;
              } else if (promo.discount_percent) {
                discount = subtotal * (Number(promo.discount_percent) / 100);
              }
            }
          }
        } else if (promo.type === "MIN_NOMINAL_FREE") {
          if (subtotal >= Number(promo.min_nominal)) {
            if (promo.discount_amount) {
              discount = Number(promo.discount_amount);
            } else if (promo.discount_percent) {
              discount = subtotal * (Number(promo.discount_percent) / 100);
            }
          }
        }
      }
    }

    const tax = Math.round((subtotal - discount) * ppnRate);
    const total = subtotal - discount + tax;
    return { subtotal, discount, tax, total };
  };
  const totals = calculateTotals();
  const totalCart = totals.total;
  const handleCheckout = async () => {
    if (!tableNo) {
      alert("Please select Order Type");
      return;
    }
    if (cart.length === 0) {
      alert("Cart is empty");
      return;
    }
    setShowPayment(true);
  };
  const processPayment = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsProcessing(true);
    try {
      // 1. Create transaction record
      const actualCustomerName = customerName || "Guest";
      const finalCustomerName = transactionNote ? `${actualCustomerName} - Note: ${transactionNote}` : actualCustomerName;
      
      let finalPaymentMethod = paymentMethod;
      let finalCash = paymentMethod === "Cash" ? Number(cashAmount) : totals.total;
      let finalChange = paymentMethod === "Cash" ? Number(cashAmount) - totals.total : 0;
      
      if (paymentMethod === "Split Payment") {
        finalPaymentMethod = splitPayments.map(p => `${p.method} (Rp ${Number(p.amount).toLocaleString('id-ID')})`).join(', ');
        const totalSplit = splitPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        finalCash = totalSplit; // Store total paid as cash_amount conceptually
        finalChange = Math.max(0, totalSplit - totals.total);
      }
      
      const userStr = localStorage.getItem("user");
      const user = userStr ? JSON.parse(userStr) : null;
      const cashierName = user ? user.username : 'Unknown';

      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .insert([{
          table_no: tableNo,
          customer_name: finalCustomerName,
          payment_method: finalPaymentMethod,
          subtotal: totals.subtotal,
          tax: totals.tax,
          discount: totals.discount,
          cash_amount: finalCash,
          change_amount: finalChange,
          total_price: totals.total,
          date: moment().tz(TIMEZONE).toISOString(),
          cashier_name: cashierName
        }])
        .select()
        .single();

      if (txError) throw txError;

      // 2. Create transaction items
      const txItems = cart.map(item => ({
        transaction_id: transaction.transaction_id,
        menu_id: item.menu_id,
        menu_name: item.note ? `${item.menu_name} (Note: ${item.note})` : item.menu_name,
        qty: item.qty,
        price: item.price,
        subtotal: item.subtotal,
        addons: item.addons,
        is_auto_free: item.is_auto_free || false
      }));

      const { error: itemsError } = await supabase
        .from('transaction_items')
        .insert(txItems);

      if (itemsError) throw itemsError;

      // 3. Update inventory stock
      for (const item of cart) {
        const menuItem = menu.find(m => m.menu_id === item.menu_id);
        if (menuItem && menuItem.recipes) {
          for (const recipe of menuItem.recipes) {
            const usage = recipe.usage_amount * item.qty;
            // Get current stock
            const { data: ing, error: ingError } = await supabase
              .from('ingredients')
              .select('current_stock')
              .eq('ingredient_id', recipe.ingredient_id)
              .single();
              
            if (!ingError && ing) {
              await supabase
                .from('ingredients')
                .update({ current_stock: ing.current_stock - usage })
                .eq('ingredient_id', recipe.ingredient_id);
            }
          }
        }
        
        // Deduct addon stock
        if (item.addons) {
          for (const addon of item.addons) {
            const addonMenu = menu.find(m => m.menu_id === addon.menu_id);
            if (addonMenu && addonMenu.recipes) {
              for (const recipe of addonMenu.recipes) {
                const usage = recipe.usage_amount * item.qty;
                const { data: ing, error: ingError } = await supabase
                  .from('ingredients')
                  .select('current_stock')
                  .eq('ingredient_id', recipe.ingredient_id)
                  .single();
                  
                if (!ingError && ing) {
                  await supabase
                    .from('ingredients')
                    .update({ current_stock: ing.current_stock - usage })
                    .eq('ingredient_id', recipe.ingredient_id);
                }
              }
            }
          }
        }
      }

      // 4. If this was an open bill, update its status
      if (openBillId) {
        await supabase.from('open_bill_items').delete().eq('bill_id', openBillId);
        await supabase
          .from('open_bills')
          .delete()
          .eq('bill_id', openBillId);
      }

      // Calculate Daily Running Number for Invoice
      const todayStart = moment(transaction.date).tz(TIMEZONE).startOf('day').utc().toISOString();
      const todayEnd = moment(transaction.date).tz(TIMEZONE).endOf('day').utc().toISOString();
      const { data: todayTxns } = await supabase
        .from('transactions')
        .select('transaction_id')
        .gte('date', todayStart)
        .lte('date', todayEnd)
        .order('transaction_id', { ascending: true });
        
      let dayIndex = 0;
      if (todayTxns) {
        dayIndex = todayTxns.findIndex(t => t.transaction_id === transaction.transaction_id);
      }
      
      const datePart = moment(transaction.date).tz(TIMEZONE).format('YYMMDD');
      const seqPart = String(Math.max(0, dayIndex) + 1).padStart(3, '0');
      const invoiceNo = `${datePart}${seqPart}`;

      const txDataConfig = {
        invoice_no: invoiceNo,
        date: moment().tz(TIMEZONE).format("YYYY-MM-DD HH:mm:ss"),
        customer_name: customerName,
        transaction_note: transactionNote,
        table_no: tableNo,
        payment_method: finalPaymentMethod,
        cash_amount: finalCash,
        change_amount: finalChange
      };

      const receiptText = formatReceiptText(storeProfile, txDataConfig, cart, totals);
      try {
        await printViaBluetooth(receiptText);
        alert("Payment & Print successful!");
      } catch (err) {
        console.error("Bluetooth print failed:", err);
        alert("Payment successful! (Bluetooth print failed/cancelled)");
      }

      setCart([]);
      setTableNo("");
      setCustomerName("");
      setTransactionNote("");
      setShowPayment(false);
      setCashAmount("");
      setSplitPayments([{ method: paymentMethodsList[0]?.name || 'Cash', amount: '' }]);
      setQrisData(null);
      fetchData(); // Refresh stock
    } catch (err) {
      if (err.message === "Failed to fetch" || (err.message && err.message.includes("fetch"))) {
        alert("Checkout failed: Failed to connect to database. Please make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are correctly set in the Secrets panel.");
      } else {
        alert(err.message || "Checkout failed");
      }
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };
  const generateQris = async () => {
    // Mock QRIS generation since we don't have a backend
    setQrisData({
      qrString: "00020101021126570011ID.CO.QRIS.WWW01189360091530000000000214123456789012340303UMI51440014ID.CO.QRIS.WWW0215ID10200210000000303UMI5204581253033605405100005802ID5911COFFEE SHOP6007JAKARTA61051234562070703A016304A1B2",
      amount: totals.total
    });
  };
  const saveOpenBill = async () => {
    if (!tableNo) {
      alert("Please select Order Type");
      return;
    }
    if (cart.length === 0) {
      alert("Cart is empty");
      return;
    }
    
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsProcessing(true);
    
    try {
      let billId = openBillId;
      const actualCustomerName = customerName || "Guest";
      const finalCustomerName = transactionNote ? `${actualCustomerName} - Note: ${transactionNote}` : actualCustomerName;
      const finalTableNo = selectedPromoId ? `${tableNo}|PROMO:${selectedPromoId}` : tableNo;

      if (openBillId) {
        // Update existing open bill
        const { error: updateError } = await supabase
          .from('open_bills')
          .update({
            table_no: finalTableNo,
            customer_name: finalCustomerName,
            subtotal: totals.subtotal,
            tax: totals.tax,
            discount: totals.discount,
            total_price: totals.total,
          })
          .eq('bill_id', openBillId);
          
        if (updateError) throw updateError;
        
        // Delete old items
        await supabase.from('open_bill_items').delete().eq('bill_id', openBillId);
      } else {
        // Create new open bill
        const { data: newBill, error: insertError } = await supabase
          .from('open_bills')
          .insert([{
            table_no: finalTableNo,
            customer_name: finalCustomerName,
            subtotal: totals.subtotal,
            tax: totals.tax,
            discount: totals.discount,
            total_price: totals.total,
            created_at: moment().tz(TIMEZONE).toISOString()
          }])
          .select()
          .single();
          
        if (insertError) throw insertError;
        billId = newBill.bill_id;
      }
      
      // Insert items
      const billItems = cart.map(item => ({
        bill_id: billId,
        menu_id: item.menu_id,
        menu_name: item.note ? `${item.menu_name} (Note: ${item.note})` : item.menu_name,
        qty: item.qty,
        price: item.price,
        subtotal: item.subtotal,
        addons: item.addons,
        is_auto_free: item.is_auto_free || false
      }));
      
      const { error: itemsError } = await supabase
        .from('open_bill_items')
        .insert(billItems);
        
      if (itemsError) throw itemsError;

      alert("Open bill saved!");
      setCart([]);
      setTableNo("");
      setCustomerName("");
      setOpenBillId(null);
    } catch (err) {
      if (err.message === "Failed to fetch" || (err.message && err.message.includes("fetch"))) {
        alert("Failed to save open bill: Failed to connect to database. Please make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are correctly set in the Secrets panel.");
      } else {
        alert(err.message || "Failed to save open bill");
      }
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };
  const getMenuMaxQty = (menuItem, cartItems = cart) => {
    const cartUsage = getCartIngredientUsage(cartItems);
    let minQty = Infinity;
    if (menuItem.recipes && menuItem.recipes.length > 0) {
      for (const r of menuItem.recipes) {
        const stock = r.current_stock - (cartUsage[r.ingredient_id] || 0);
        const possible = Math.floor(stock / r.usage_amount);
        if (possible < minQty) minQty = possible;
      }
    } else {
      minQty = 999;
    }
    return Math.max(0, minQty);
  };

  const filteredMenu = menu.filter((item) => {
    if (item.category && (item.category.toLowerCase() === "add-ons" || item.category.toLowerCase() === "addons")) return false;
    if (activeCategory !== "All" && item.category !== activeCategory) return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  return <div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {
    /* Left Side - Menu */
  }
      <div className="flex-1 flex flex-col h-full border-r border-gray-200 dark:border-gray-700">
        {
    /* Header */
  }
        <div className="p-5 bg-white dark:bg-gray-800 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex space-x-2 overflow-x-auto pb-2 w-full sm:w-auto">
            {categories.map((cat) => <button
    key={cat}
    onClick={() => setActiveCategory(cat)}
    className={clsx(
      "px-4 py-2 rounded-full whitespace-nowrap font-medium transition-colors",
      activeCategory === cat ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:bg-gray-600"
    )}
  >
                {cat}
              </button>)}
          </div>
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
    type="text"
    placeholder="Search menu..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="w-full pl-10 pr-4 py-2 dark:text-gray-300 rounded-xl border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none sm:w-64"
  />
          </div>
        </div>

        {
    /* Menu Grid */
  }
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredMenu.map((item) => {
    const currentMaxQty = getMenuMaxQty(item);
    const outOfStock = currentMaxQty <= 0;
    return <div
      key={item.menu_id}
      onClick={() => !outOfStock && handleMenuClick(item)}
      className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col ${outOfStock ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:shadow-md transition-shadow"}`}
    >
                <div className="h-40 bg-blue-50 dark:bg-blue-900/30 relative flex items-center justify-center">
                  <span className="text-blue-500 dark:text-blue-400 font-bold text-6xl opacity-30 select-none">
                    {item.name ? item.name.charAt(0).toUpperCase() : '?'}
                  </span>
                  <div className="absolute top-2 right-2 bg-white dark:bg-gray-800/90 px-2 py-1 rounded-lg text-xs font-bold text-gray-800 dark:text-gray-100">
                    {item.category}
                  </div>
                  {outOfStock && <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white font-bold px-3 py-1 bg-red-500 rounded-full text-sm">Out of Stock</span>
                    </div>}
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-100 leading-tight mb-2">{item.name}</h3>
                  <p className="text-blue-600 dark:text-blue-400 font-bold">Rp {Number(item.price || 0).toLocaleString("id-ID")}</p>
                </div>
              </div>;
  })}
          </div>
        </div>
      </div>

      {
    /* Right Side - Cart */
  }
      <div className="w-96 bg-white dark:bg-gray-800 flex flex-col h-full shadow-xl z-10">
        <div className="p-7.5 border-b bg-gray-50 dark:bg-gray-900 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Current Order</h2>
          <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-bold">
            {cart.length} items
          </span>
        </div>

        {
    /* Cart Items */
  }
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {cart.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <ShoppingBag size={48} className="mb-4 opacity-50" />
              <p>Cart is empty</p>
            </div> : cart.map((item, index) => <div key={index} className="flex flex-col p-3 border border-gray-100 rounded-xl bg-gray-50 dark:bg-gray-900">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-800 dark:text-gray-100">{item.menu_name}</h4>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 space-y-0.5">
                      {item.drink_type && <p>{item.drink_type} • {item.sugar_level} Sugar</p>}
                      {item.addons.map((a, i) => <p key={i}>+ {a.name} (Rp {a.price})</p>)}
                      {item.note && <p className="italic text-gray-400">Note: {item.note}</p>}
                    </div>
                  </div>
                  <p className="font-bold text-blue-600 dark:text-blue-400">Rp {Number(item.subtotal || 0).toLocaleString("id-ID")}</p>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-1">
                    <button onClick={() => updateCartQty(index, -1)} disabled={item.is_auto_free} className="p-1 hover:bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300 disabled:opacity-50">
                      <Minus size={16} />
                    </button>
                    <span className="font-bold w-6 text-center dark:text-gray-300">{item.qty}</span>
                    <button onClick={() => updateCartQty(index, 1)} disabled={item.is_auto_free} className="p-1 hover:bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300 disabled:opacity-50">
                      <Plus size={16} />
                    </button>
                  </div>
                  <button onClick={() => updateCartQty(index, -item.qty)} disabled={item.is_auto_free} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors disabled:opacity-50">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>)}
        </div>

        {
    /* Checkout Section */
  }
        <div className="p-4 border-t bg-white dark:bg-gray-800 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="space-y-3 mb-4">
            <div className="flex space-x-3">
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Order Type *</label>
                <select
    value={tableNo}
    onChange={(e) => setTableNo(e.target.value)}
    className="w-full p-2 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
  >
                  <option value="">Select Type</option>
                  <option value="Cafe">Cafe</option>
                  <option value="Court">Court</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Customer (Optional)</label>
                <input
    type="text"
    value={customerName}
    onChange={(e) => setCustomerName(e.target.value)}
    placeholder="Name"
    className="w-full p-2 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
  />
              </div>
            </div>
            
            <div className="mb-3">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Promo (Optional)</label>
              <select
                value={selectedPromoId}
                onChange={(e) => setSelectedPromoId(e.target.value)}
                className="w-full p-2 dark:text-gray-500 border border-blue-200 bg-blue-50 dark:bg-blue-900/30 text-blue-800 rounded-lg outline-none focus:border-blue-500 font-medium"
              >
                <option value="">No Promo</option>
                {promos.filter(isPromoValid).map(p => (
                  <option key={p.promo_id} value={p.promo_id.toString()}>{p.title}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-gray-500 dark:text-gray-400 text-sm">Subtotal</span>
              <span className="font-medium text-gray-800 dark:text-gray-100">Rp {Number(totals.subtotal || 0).toLocaleString("id-ID")}</span>
            </div>
            {totals.discount > 0 && <div className="flex justify-between items-center py-1">
                <span className="text-green-500 text-sm">Discount</span>
                <span className="font-medium text-green-600">-Rp {Number(totals.discount || 0).toLocaleString("id-ID")}</span>
              </div>}
            <div className="flex justify-between items-center py-1">
              <span className="text-gray-500 dark:text-gray-400 text-sm">PPN 11%</span>
              <span className="font-medium text-gray-800 dark:text-gray-100">Rp {Number(totals.tax || 0).toLocaleString("id-ID")}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-t border-gray-100 mt-2">
              <span className="text-gray-500 dark:text-gray-400 font-bold">Total</span>
              <span className="text-2xl font-black text-gray-800 dark:text-gray-100">Rp {Number(totals.total || 0).toLocaleString("id-ID")}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
    onClick={saveOpenBill}
    className="py-3 px-4 bg-orange-100 text-orange-700 font-bold rounded-xl hover:bg-orange-200 transition-colors"
  >
              Save Bill
            </button>
            <button
    onClick={handleCheckout}
    className="py-3 px-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-md shadow-blue-200"
  >
              Pay Now
            </button>
          </div>
        </div>
      </div>

      {
    /* Options Modal */
  }
      {showOptions && selectedMenu && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 dark:bg-gray-900">
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{selectedMenu.name}</h3>
              <button onClick={() => setShowOptions(false)} className="p-2 hover:bg-gray-200 dark:bg-gray-600 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {
    /* Quantity */
  }
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Quantity</label>
                <div className="flex items-center space-x-4">
                  <button
    onClick={() => setQty(Math.max(1, qty - 1))}
    className="w-12 h-12 rounded-full border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center hover:border-blue-500 hover:text-blue-500 dark:text-blue-400 transition-colors"
  >
                    <Minus size={20} />
                  </button>
                  <span className="text-2xl font-bold w-12 text-center dark:text-gray-300">{qty}</span>
                  <button
    onClick={() => setQty(Math.min(getMaxAllowedQty(), qty + 1))}
    disabled={qty >= getMaxAllowedQty()}
    className="w-12 h-12 rounded-full border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center hover:border-blue-500 hover:text-blue-500 dark:text-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>

              {
    /* Drink Options */
  }
              {(selectedMenu.category === "Coffee" || selectedMenu.category === "Non Coffee") && <>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Type</label>
                    <div className="grid grid-cols-2 gap-3">
                      {["Hot", "Ice"].map((type) => <button
    key={type}
    onClick={() => setDrinkType(type)}
    className={clsx(
      "py-3 rounded-xl font-medium border-2 transition-all",
      drinkType === type ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:border-gray-600"
    )}
  >
                          {type}
                        </button>)}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Sugar Level</label>
                    <div className="grid grid-cols-2 gap-3">
                      {["No Sugar", "Less", "Normal", "Extra"].map((level) => <button
    key={level}
    onClick={() => setSugarLevel(level)}
    className={clsx(
      "py-3 rounded-xl font-medium border-2 transition-all",
      sugarLevel === level ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:border-gray-600"
    )}
  >
                          {level}
                        </button>)}
                    </div>
                  </div>
                </>}

              {
    /* Addons */
  }
              {selectedMenu.addons && selectedMenu.addons.length > 0 && <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Add-ons</label>
                  <div className="space-y-2">
                    {selectedMenu.addons.map((addon) => {
    const isSelected = selectedAddons.find((a) => a.menu_id === addon.menu_id);
    const outOfStock = isAddonOutOfStock(addon);
    return <button
      key={addon.menu_id}
      disabled={outOfStock}
      onClick={() => {
        if (isSelected) {
          setSelectedAddons(selectedAddons.filter((a) => a.menu_id !== addon.menu_id));
        } else {
          setSelectedAddons([...selectedAddons, addon]);
        }
      }}
      className={clsx(
        "w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all",
        isSelected ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:border-gray-600",
        outOfStock && "opacity-50 cursor-not-allowed"
      )}
    >
                          <div className="flex items-center space-x-3">
                            <div className={clsx(
      "w-6 h-6 rounded border flex items-center justify-center",
      isSelected ? "bg-blue-500 dark:bg-blue-900/300 border-blue-500 text-white" : "border-gray-300 dark:border-gray-600"
    )}>
                              {isSelected && <Check size={16} />}
                            </div>
                            <span className="font-medium text-gray-800 dark:text-gray-100">{addon.name} {outOfStock && <span className="text-xs text-red-500 ml-2">(Out of Stock)</span>}</span>
                          </div>
                          <span className="text-gray-500 dark:text-gray-400">+ Rp {Number(addon.price || 0).toLocaleString("id-ID")}</span>
                        </button>;
  })}
                  </div>
                </div>}

              {
    /* Notes */
  }
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Special Request (Optional)</label>
                <textarea
                  value={itemNote}
                  onChange={(e) => setItemNote(e.target.value)}
                  placeholder="E.g., less ice, extra hot..."
                  className="w-full p-3 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                  rows={2}
                ></textarea>
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 dark:bg-gray-900">
              <button
    onClick={handleAddToCart}
    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition-colors shadow-lg shadow-blue-200"
  >
                Add to Order - Rp {Number(((selectedMenu.price + selectedAddons.reduce((s, a) => s + a.price, 0)) * qty) || 0).toLocaleString("id-ID")}
              </button>
            </div>
          </div>
        </div>}

      {
    /* Payment Modal */
  }
      {showPayment && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 dark:bg-gray-900">
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Payment</h3>
              <button onClick={() => setShowPayment(false)} className="p-2 hover:bg-gray-200 dark:bg-gray-600 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="text-center">
                <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">Total Amount</p>
                <p className="text-4xl font-black text-gray-800 dark:text-gray-100">Rp {Number(totalCart || 0).toLocaleString("id-ID")}</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Transaction Notes/Remarks (Optional)</label>
                <textarea
                  value={transactionNote}
                  onChange={(e) => setTransactionNote(e.target.value)}
                  placeholder="E.g., Customer requested split bill, special occasion..."
                  className="w-full p-3 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                  rows={2}
                ></textarea>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Payment Method</label>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {paymentMethodsList.map((pmData) => <button
    key={pmData.id}
    onClick={() => {
      setPaymentMethod(pmData.name);
      setQrisData(null);
    }}
    className={clsx(
      "py-3 px-4 rounded-xl font-medium border-2 transition-all text-left",
      paymentMethod === pmData.name ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:border-gray-600"
    )}
  >
                      {pmData.name}
                    </button>)}
                    
                  <button
                    onClick={() => {
                      setPaymentMethod("Split Payment");
                      setSplitPayments([{ method: paymentMethodsList[0]?.name || 'Cash', amount: totals.total }]);
                      setQrisData(null);
                    }}
                    className={clsx(
                      "py-3 px-4 rounded-xl font-medium border-2 transition-all text-left",
                      paymentMethod === "Split Payment" ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:border-gray-600"
                    )}
                  >
                    Split Payment
                  </button>
                </div>
              </div>

              {paymentMethod === "Split Payment" && <div className="space-y-4 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-gray-700 dark:text-gray-200">Split Details</span>
                  <div className="flex flex-col items-end">
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Remains: Rp {Number(Math.max(0, totalCart - splitPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0))).toLocaleString('id-ID')}
                  </span>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Change: Rp {Number(Math.max(0, splitPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0) - totalCart)).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
                {splitPayments.map((sp, idx) => (
                  <div key={idx} className="flex space-x-2 items-center">
                    <select
                      value={sp.method}
                      onChange={(e) => {
                        const newSplit = [...splitPayments];
                        newSplit[idx].method = e.target.value;
                        setSplitPayments(newSplit);
                      }}
                      className="flex-1 p-3 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl outline-none focus:border-blue-500"
                    >
                      {paymentMethodsList.map(pm => <option key={pm.id} value={pm.name}>{pm.name}</option>)}
                    </select>
                    <input
                      type="text"
                      value={sp.amount ? Number(sp.amount).toLocaleString('id-ID') : ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        const newSplit = [...splitPayments];
                        newSplit[idx].amount = val;
                        setSplitPayments(newSplit);
                      }}
                      placeholder="Amount"
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl outline-none focus:border-blue-500 dark:text-gray-200 text-right font-medium"
                    />
                    <button
                      onClick={() => {
                        if (splitPayments.length > 1) {
                          setSplitPayments(splitPayments.filter((_, i) => i !== idx));
                        }
                      }}
                      className="p-3 text-red-500 hover:bg-red-50 rounded-xl border border-transparent hover:border-red-200"
                    >
                      <X size={20} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setSplitPayments([...splitPayments, { method: paymentMethodsList[0]?.name || 'Cash', amount: '' }])}
                  className="w-full py-2 bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 font-bold hover:bg-gray-50 dark:bg-gray-900 flex justify-center items-center gap-2"
                >
                  <Plus size={16} /> Add Payment Method
                </button>
              </div>}

              {paymentMethod === "Cash" && <div className="space-y-4 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Cash Received</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-bold">Rp</span>
                      <input
    type="text"
    value={cashAmount ? Number(cashAmount).toLocaleString('id-ID') : ''}
    onChange={(e) => {
      const val = e.target.value.replace(/\D/g, "");
      setCashAmount(val);
    }}
    className="w-full pl-12 pr-4 py-3 dark:text-gray-300 rounded-xl border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-lg font-bold"
    placeholder="0"
  />
                    </div>
                  </div>
                  {parseFloat(cashAmount) >= totalCart && <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                      <span className="text-green-800 font-medium">Change</span>
                      <span className="text-xl font-bold text-green-700">Rp {Number((parseFloat(cashAmount) - totalCart) || 0).toLocaleString("id-ID")}</span>
                    </div>}
                </div>}

              
            </div>

            <div className="p-4 border-t bg-gray-50 dark:bg-gray-900">
              <button
    onClick={processPayment}
    disabled={isProcessing || !getSufficientPayment()}
    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-colors shadow-lg shadow-green-200"
  >
                {isProcessing ? "Processing..." : "Complete Payment"}
              </button>
            </div>
          </div>
        </div>}
    </div>;
}
export {
  POS as default
};
