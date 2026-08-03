import React from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Receipt, 
  History as HistoryIcon, 
  MenuSquare, 
  Package, 
  Tag, 
  Users, 
  Settings as SettingsIcon,
  CreditCard,
  LogOut,
  ChevronLeft,
  Menu as MenuIcon
} from "lucide-react";

function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;
  const adminPerms = ["pos", "open-bills", "history", "menu", "inventory", "promo", "roles", "payment-methods", "settings"];
  const rawPerms = user?.permissions;
  let permissions = [];
  if (user?.role === "ADMIN") {
    permissions = adminPerms;
  } else {
    permissions = Array.isArray(rawPerms) ? rawPerms : (typeof rawPerms === 'string' ? JSON.parse(rawPerms) : []);
  }
  
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const navItems = [
    { path: "/", label: "Dashboard", icon: <LayoutDashboard size={20} />, permission: null },
    { path: "/pos", label: "POS", icon: <ShoppingCart size={20} />, permission: "pos" },
    { path: "/open-bills", label: "Open Bills", icon: <Receipt size={20} />, permission: "open-bills" },
    { path: "/history", label: "History", icon: <HistoryIcon size={20} />, permission: "history" },
    { path: "/menu", label: "Menu", icon: <MenuSquare size={20} />, permission: "menu" },
    { path: "/inventory", label: "Inventory", icon: <Package size={20} />, permission: "inventory" },
    { path: "/promo", label: "Promo", icon: <Tag size={20} />, permission: "promo" },
    { path: "/payment-methods", label: "Payment Methods", icon: <CreditCard size={20} />, permission: "payment-methods" },
    { path: "/roles", label: "Roles", icon: <Users size={20} />, permission: "roles" },
    { path: "/settings", label: "Settings", icon: <SettingsIcon size={20} />, permission: "settings" },
  ];

  const [theme, setTheme] = React.useState(localStorage.getItem('theme') || 'light');

  // Apply theme on load and when state changes
  React.useEffect(() => {
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300 relative`}>
        {/* Toggle Button */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -right-3 top-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full p-1.5 text-gray-500 hover:text-blue-600 z-10 hidden sm:block"
        >
          {isSidebarOpen ? <ChevronLeft size={16} /> : <MenuIcon size={16} />}
        </button>

        <div className={`p-4 border-b border-gray-200 dark:border-gray-700 flex ${isSidebarOpen ? 'justify-between' : 'justify-center'} items-center`}>
          {isSidebarOpen && (
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">QubitePOS</h1>
              {user && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate max-w-[140px]">{user.username}</p>}
              </div>
              )}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
            title="Toggle Dark Mode"
          >
            {theme === 'dark' ? <div>☀️</div> : <div>🌙</div>}
          </button>
        </div>
        
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            if (item.permission && !permissions.includes(item.permission)) return null;
            
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center ${isSidebarOpen ? 'space-x-3 px-4' : 'justify-center px-0'} py-3 rounded-xl transition-colors ${
                  isActive 
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium" 
                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
                }`}
                title={!isSidebarOpen ? item.label : undefined}
              >
                <div className="flex-shrink-0">{item.icon}</div>
                {isSidebarOpen && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleLogout}
            className={`flex items-center ${isSidebarOpen ? 'space-x-3 px-4' : 'justify-center px-0'} py-3 w-full rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors`}
            title={!isSidebarOpen ? "Logout" : undefined}
          >
            <LogOut size={20} className="flex-shrink-0" />
            {isSidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}

export default Layout;
