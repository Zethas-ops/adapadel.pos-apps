import { useEffect, useState } from "react";
import { Plus, Edit, Trash2, Image as ImageIcon, Search, Tag, X } from "lucide-react";
import { supabase } from "../lib/supabase";

function MenuManagement() {
  const [menu, setMenu] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState(["Coffee", "Non Coffee", "Food", "Add-Ons"]);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    category: "Coffee",
    price: "",
    addon_target: "All",
    recipes: [],
    addons: []
  });
  useEffect(() => {
    fetchData();
  }, []);
  const fetchData = async () => {
    try {
      const [menuRes, invRes, recipesRes, addonsRes] = await Promise.all([
        supabase.from('menu').select('*').order('menu_id', { ascending: true }),
        supabase.from('ingredients').select('*').order('ingredient_id', { ascending: true }),
        supabase.from('recipes').select('*'),
        supabase.from('menu_addons').select('*')
      ]);

      if (menuRes.error) console.error("Menu fetch error:", menuRes.error);
      if (invRes.error) console.error("Ingredients fetch error:", invRes.error);
      if (recipesRes.error) console.error("Recipes fetch error:", recipesRes.error);
      if (addonsRes.error) console.error("Addons fetch error:", addonsRes.error);

      const menuData = (menuRes.data || []).map(item => {
        let image = item.image;
        let addon_target = item.addon_target;
        if (addon_target && addon_target.includes('|||')) {
          const parts = addon_target.split('|||');
          addon_target = parts[0] || null;
          image = parts[1];
        }
        return {
        ...item,
        image,
        addon_target,
        recipes: recipesRes.data?.filter(r => r.menu_id === item.menu_id).map(r => {
          const ing = invRes.data?.find(i => i.ingredient_id === r.ingredient_id);
          return {
            ...r,
            ingredient_name: ing ? ing.ingredient_name : 'Unknown',
            unit: ing ? ing.unit : ''
          };
        }) || [],
        addons: addonsRes.data?.filter(a => a.menu_id === item.menu_id).map(a => ({ menu_id: a.addon_menu_id })) || []
        };
      });

      menuData.sort((a, b) => a.name.localeCompare(b.name));
      setMenu(menuData);
      setIngredients(invRes.data || []);
      
      const uniqueCategories = Array.from(new Set(menuData.map((item) => item.category)));
      const finalCategories = Array.from(new Set(["Add-Ons", ...uniqueCategories]));
      setCategories(finalCategories);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    const validRecipes = formData.recipes.filter((r) => r.ingredient_id && r.usage_amount);
    if (validRecipes.length === 0) {
      alert("Please add at least one ingredient for this menu item.");
      return;
    }
    const finalCategory = showNewCategoryInput && newCategory.trim() !== "" ? newCategory.trim() : formData.category;
    
    if (showNewCategoryInput && categories.some(c => c.toLowerCase() === finalCategory.toLowerCase())) {
      alert("Category already exists. Please select it from the dropdown.");
      return;
    }
    
    try {
      let addonTarget = finalCategory === "Add-Ons" ? formData.addon_target : null;

      const menuPayload = {
        name: formData.name,
        category: finalCategory,
        price: parseFloat(formData.price),
        addon_target: addonTarget,
        image: null
      };

      let currentMenuId = editId;

      if (editId) {
        // Update existing menu
        const { error: updateError } = await supabase
          .from('menu')
          .update(menuPayload)
          .eq('menu_id', editId);
          
        if (updateError) throw updateError;
        
        // Delete old recipes and addons
        await supabase.from('recipes').delete().eq('menu_id', editId);
        await supabase.from('menu_addons').delete().eq('menu_id', editId);
      } else {
        // Insert new menu
        const { data: newMenu, error: insertError } = await supabase
          .from('menu')
          .insert([menuPayload])
          .select()
          .single();
          
        if (insertError) throw insertError;
        currentMenuId = newMenu.menu_id;
      }

      // Insert recipes
      if (validRecipes.length > 0) {
        const recipesPayload = validRecipes.map(r => ({
          menu_id: currentMenuId,
          ingredient_id: parseInt(r.ingredient_id),
          usage_amount: parseFloat(r.usage_amount)
        }));
        await supabase.from('recipes').insert(recipesPayload);
      }

      // Insert addons
      if (formData.addons && formData.addons.length > 0) {
        const addonsPayload = formData.addons.map(addonId => ({
          menu_id: currentMenuId,
          addon_menu_id: parseInt(addonId)
        }));
        await supabase.from('menu_addons').insert(addonsPayload);
      }

      setShowModal(false);
      setEditId(null);
      setShowNewCategoryInput(false);
      setNewCategory("");
      setFormData({ name: "", category: "Coffee", price: "", addon_target: "All", recipes: [], addons: [] });
      fetchData();
    } catch (err) {
      if (err.message === "Failed to fetch" || err.message.includes("fetch")) {
        alert("Error saving menu: Failed to connect to database. Please make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are correctly set in the Secrets panel.");
      } else {
        alert("Error saving menu: " + err.message);
      }
    }
  };
  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from('menu').delete().eq('menu_id', deleteId);
      if (error) throw error;
      setDeleteId(null);
      fetchData();
    } catch (err) {
      alert("Error deleting menu: " + err.message);
    }
  };
  const [deleteCategoryName, setDeleteCategoryName] = useState(null);

  const handleDeleteCategory = (categoryToDelete) => {
    setDeleteCategoryName(categoryToDelete);
  };

  const confirmDeleteCategory = async () => {
    if (!deleteCategoryName) return;
      try {
        const { error } = await supabase
          .from('menu')
          .update({ category: 'Uncategorized' })
          .eq('category', deleteCategoryName);
        
        if (error) throw error;
        setDeleteCategoryName(null);
        fetchData();
      } catch (err) {
        alert("Error deleting category: " + err.message);
      }
    };
  const handleEdit = (item) => {
    setEditId(item.menu_id);
    setShowNewCategoryInput(false);
    setNewCategory("");
    setFormData({
      name: item.name,
      category: item.category,
      price: item.price.toString(),
      addon_target: item.addon_target || "All",
      recipes: item.recipes || [],
      addons: item.addons?.map((a) => a.menu_id) || []
    });
    setShowModal(true);
  };
  const addRecipeRow = () => {
    setFormData({ ...formData, recipes: [...formData.recipes, { ingredient_id: "", usage_amount: "" }] });
  };
  const updateRecipeRow = (index, field, value) => {
    const newRecipes = [...formData.recipes];
    newRecipes[index][field] = value;
    setFormData({ ...formData, recipes: newRecipes });
  };
  const removeRecipeRow = (index) => {
    const newRecipes = [...formData.recipes];
    newRecipes.splice(index, 1);
    setFormData({ ...formData, recipes: newRecipes });
  };
  const filteredMenu = menu.filter(
    (item) => item.name.toLowerCase().includes(search.toLowerCase()) || item.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleOnChangePrice = (e) => {
  let value = e.target.value;

  // ambil angka saja
  const raw = value.replace(/\D/g, "");

  // batas max digit (misal 6)
  if (raw.length <= 8) {
    setFormData({ ...formData, price: raw });
  }
};

  const handleOnChangeName = (e) => {
    const value = e.target.value;
    if (value.length <= 25) {
      setFormData({ ...formData, name: value });
    }
  };
  
  const formatRupiah = (value) => {
    if (!value) return "";
    return "Rp " + Number(value).toLocaleString("id-ID");
  };
  return <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Menu Management</h1>
        <div className="flex items-center space-x-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
    type="text"
    placeholder="Search menu..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="w-full pl-10 pr-4 py-2 dark:text-gray-300 rounded-xl border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
  />
          </div>
          <button
            onClick={() => setShowCategoryModal(true)}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded-xl flex items-center space-x-2 transition-colors shadow-sm whitespace-nowrap"
          >
            <Tag size={20} />
            <span>Categories</span>
          </button>
          <button
    onClick={() => {
      setEditId(null);
      setShowNewCategoryInput(false);
      setNewCategory("");
      setFormData({ name: "", category: "Coffee", price: "", image: null, addon_target: "All", recipes: [], addons: [] });
      setShowModal(true);
    }}
    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-xl flex items-center space-x-2 transition-colors shadow-md shadow-blue-200 whitespace-nowrap"
  >
            <Plus size={20} />
            <span>Add Menu</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {filteredMenu.map((item) => <div key={item.menu_id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
            <div className="h-48 bg-blue-50 relative flex items-center justify-center">
              <span className="text-blue-500 font-bold text-6xl opacity-30 select-none">
                {item.name ? item.name.charAt(0).toUpperCase() : '?'}
              </span>
              <div className="absolute top-2 right-2 bg-white/90 px-2 py-1 rounded-lg text-xs font-bold text-gray-800">
                {item.category}
              </div>
            </div>
            <div className="p-4 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-gray-800 text-lg leading-tight mb-1">{item.name}</h3>
                <p className="text-blue-600 font-bold text-xl mb-4">Rp {item.price.toLocaleString("id-ID")}</p>
                
                {item.recipes && item.recipes.length > 0 && <div className="mb-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Ingredients</p>
                    <div className="space-y-1">
                      {item.recipes.map((r, i) => <p key={i} className="text-sm text-gray-600 flex justify-between">
                          <span>{r.ingredient_name}</span>
                          <span className="font-medium">{r.usage_amount} {r.unit}</span>
                        </p>)}
                    </div>
                  </div>}
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-gray-100 mt-4">
                <button
    onClick={() => handleEdit(item)}
    className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
    title="Edit"
  >
                  <Edit size={20} />
                </button>
                <button
    onClick={() => setDeleteId(item.menu_id)}
    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
    title="Delete"
  >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          </div>)}
      </div>

      {
    /* Add/Edit Menu Modal */
  }
      {showModal && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-800">{editId ? "Edit Menu" : "Add New Menu"}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                <Trash2 size={24} className="hidden" />
                <span className="text-xl font-bold">×</span>
              </button>
            </div>

            <form id="menuForm" onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Name *</label>
                  <input
    required
    type="text"
    value={formData.name}
    onChange={(e) => handleOnChangeName(e)}
    className="w-full p-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Category *</label>
                  <select
    required={!showNewCategoryInput}
    value={showNewCategoryInput ? "NEW" : formData.category}
    onChange={(e) => {
      if (e.target.value === "NEW") {
        setShowNewCategoryInput(true);
      } else {
        setShowNewCategoryInput(false);
        setFormData({ ...formData, category: e.target.value });
      }
    }}
    className="w-full p-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
  >
                    {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                    <option value="NEW">+ Add New Category</option>
                  </select>
                  {showNewCategoryInput && <input
    type="text"
    required
    placeholder="Enter new category name"
    value={newCategory}
    onChange={(e) => setNewCategory(e.target.value)}
    className="w-full mt-2 p-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
  />}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Price *</label>
                  <input
    required
    type="text"
    value={formatRupiah(formData.price)}
    onChange={handleOnChangePrice}
    placeholder="Rp 0"
    className="w-full p-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
  />
                </div>
              </div>

              {(formData.category === "Add-Ons" || showNewCategoryInput && newCategory.trim() === "Add-Ons") && <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Add-on Target Category *</label>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center space-x-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-blue-50">
                      <input
                        type="checkbox"
                        checked={formData.addon_target === "All" || formData.addon_target.includes("All")}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, addon_target: "All" });
                          } else {
                            setFormData({ ...formData, addon_target: "" });
                          }
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">All Categories</span>
                    </label>
                    {categories.filter((c) => c !== "Add-Ons").map((cat) => (
                      <label key={cat} className="flex items-center space-x-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-blue-50">
                        <input
                          type="checkbox"
                          checked={formData.addon_target !== "All" && formData.addon_target.split(',').includes(cat)}
                          onChange={(e) => {
                            let targets = formData.addon_target === "All" ? [] : formData.addon_target.split(',').filter(Boolean);
                            if (e.target.checked) {
                              targets.push(cat);
                            } else {
                              targets = targets.filter(t => t !== cat);
                            }
                            setFormData({ ...formData, addon_target: targets.length > 0 ? targets.join(',') : "" });
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">{cat}</span>
                      </label>
                    ))}
                  </div>
                </div>}

              {
    /* Recipe Section */
  }
              <div className="border-t border-gray-200 pt-6">
                <div className="flex justify-between items-center mb-4">
                  <label className="block text-sm font-bold text-gray-700">Recipe (Ingredients Usage)</label>
                  <button
    type="button"
    onClick={addRecipeRow}
    className="text-blue-600 font-bold text-sm flex items-center hover:text-blue-700"
  >
                    <Plus size={16} className="mr-1" /> Add Ingredient
                  </button>
                </div>
                
                <div className="space-y-3">
                  {formData.recipes.map((recipe, index) => <div key={index} className="flex space-x-3 items-center">
                      <select
    required
    value={recipe.ingredient_id}
    onChange={(e) => updateRecipeRow(index, "ingredient_id", e.target.value)}
    className="flex-1 p-3 rounded-xl border border-gray-300 outline-none"
  >
                        <option value="">Select Ingredient</option>
                        {ingredients.map((inv) => <option key={inv.ingredient_id} value={inv.ingredient_id}>
                            {inv.ingredient_name} ({inv.unit})
                          </option>)}
                      </select>
                      <div className="relative w-32">
                        <input
                          required
                          type="number"
                          placeholder="Amount"
                          value={recipe.usage_amount}
                          onChange={(e) => updateRecipeRow(index, "usage_amount", e.target.value)}
                          className="w-full p-3 pr-12 rounded-xl border border-gray-300 outline-none"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">
                          {ingredients.find(i => i.ingredient_id.toString() === recipe.ingredient_id.toString())?.unit || ''}
                        </span>
                      </div>
                      <button
    type="button"
    onClick={() => removeRecipeRow(index)}
    className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
  >
                        <Trash2 size={20} />
                      </button>
                    </div>)}
                </div>
              </div>

              {
    /* Addons Section */
  }
              {formData.category !== "Add-Ons" && <div className="border-t border-gray-200 pt-6">
                  <label className="block text-sm font-bold text-gray-700 mb-4">Allowed Add-ons</label>
                  <div className="grid grid-cols-2 gap-3">
                    {menu.filter((m) => m.category === "Add-Ons" && (m.addon_target === "All" || (m.addon_target && m.addon_target.split(',').includes(formData.category)))).map((addon) => <label key={addon.menu_id} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                        <input
    type="checkbox"
    checked={formData.addons.includes(addon.menu_id)}
    onChange={(e) => {
      if (e.target.checked) {
        setFormData({ ...formData, addons: [...formData.addons, addon.menu_id] });
      } else {
        setFormData({ ...formData, addons: formData.addons.filter((id) => id !== addon.menu_id) });
      }
    }}
    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
  />
                        <span className="font-medium text-gray-700">{addon.name}</span>
                      </label>)}
                  </div>
                </div>}
            </form>

            <div className="p-6 border-t bg-gray-50 flex justify-end space-x-3">
              <button
    onClick={() => setShowModal(false)}
    className="px-6 py-3 font-bold text-gray-600 hover:bg-gray-200 rounded-xl transition-colors"
  >
                Cancel
              </button>
              <button
    type="submit"
    form="menuForm"
    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-md shadow-blue-200"
  >
                Save Menu
              </button>
            </div>
          </div>
        </div>}

      {
    /* Delete Confirmation Modal */
  }
      {deleteId && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-6 border-b bg-gray-50">
              <h2 className="text-2xl font-bold text-gray-800">Confirm Deletion</h2>
            </div>
            <div className="p-6">
              <p className="text-gray-600">Are you sure you want to delete this menu item? This action cannot be undone.</p>
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end space-x-3">
              <button
    onClick={() => setDeleteId(null)}
    className="px-6 py-3 font-bold text-gray-600 hover:bg-gray-200 rounded-xl transition-colors"
  >
                Cancel
              </button>
              <button
    onClick={confirmDelete}
    className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors shadow-md shadow-red-200"
  >
                Delete
              </button>
            </div>
          </div>
        </div>}

      {/* Category Management Modal */}
      {showCategoryModal && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-bold text-gray-800">Manage Categories</h3>
              <button onClick={() => setShowCategoryModal(false)} className="p-2 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-sm text-gray-500 mb-4">
                Deleting a category will move all its menu items to "Uncategorized".
              </p>
              <div className="space-y-2">
                {categories.map((cat) => (
                  <div key={cat} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <span className="font-medium text-gray-800">{cat}</span>
                    {cat !== "Add-Ons" && cat !== "Uncategorized" && (
                      <button
                        onClick={() => handleDeleteCategory(cat)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Category"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
                {categories.length === 0 && (
                  <p className="text-center text-gray-500 py-4">No categories found.</p>
                )}
              </div>
            </div>
          </div>
        </div>}
        
      {deleteCategoryName && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-6 border-b bg-gray-50 dark:bg-gray-900">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Confirm Deletion</h2>
            </div>
            <div className="p-6">
              <p className="text-gray-600 dark:text-gray-300">Are you sure you want to delete the category "{deleteCategoryName}"? All menu items in this category will be moved to "Uncategorized".</p>
            </div>
            <div className="p-6 border-t bg-gray-50 dark:bg-gray-900 flex justify-end space-x-3">
              <button
                onClick={() => setDeleteCategoryName(null)}
                className="px-6 py-3 font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:bg-gray-600 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCategory}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors shadow-md shadow-red-200"
              >
                Delete
              </button>
            </div>
          </div>
        </div>}
    </div>;
}
export {
  MenuManagement as default
};
