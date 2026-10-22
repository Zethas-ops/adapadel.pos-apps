import { useEffect, useState } from "react";
import { Search, Edit, CheckCircle, ChefHat } from "lucide-react";
import { useNavigate } from "react-router-dom";
import moment from "moment-timezone";
import { supabase } from "../lib/supabase";
import { printCaptainOrder } from "../utils/printer";

const TIMEZONE = 'Asia/Jakarta';

function OpenBills() {
  const [bills, setBills] = useState([]);
  const [search, setSearch] = useState("");
  const [storeProfile, setStoreProfile] = useState(null);
  const [printingBillId, setPrintingBillId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchBills();
    supabase.from('store_profile').select('*').single().then(({ data }) => {
      if (data) setStoreProfile(data);
    });
  }, []);

  const fetchBills = async () => {
    try {
      const { data, error } = await supabase
        .from('open_bills')
        .select('*, open_bill_items(*)')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      const formattedData = data.map(bill => ({
        ...bill,
        items: bill.open_bill_items || []
      }));
      
      setBills(formattedData);
    } catch (err) {
      console.error("Error fetching open bills:", err);
    }
  };

  const handleEdit = (bill) => {
    navigate("/pos", { state: { bill, action: "edit" } });
  };

  const handleClose = (bill) => {
    navigate("/pos", { state: { bill, action: "close" } });
  };
  
  const handlePrintCaptain = async (bill) => {
    if (printingBillId) return;
    setPrintingBillId(bill.bill_id);
    try {
      const orderInfo = {
        bill_id: bill.bill_id,
        table_no: bill.table_no.split('|PROMO:')[0],
        customer_name: bill.customer_name,
        date: moment.utc(bill.created_at).tz(TIMEZONE).format("YYYY-MM-DD HH:mm:ss"),
        isAdditional: false
      };
      await printCaptainOrder(storeProfile, orderInfo, bill.items);
    } catch (err) {
      console.error("Error printing captain order:", err);
    } finally {
      setPrintingBillId(null);
    }
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    return moment.utc(timeStr).tz(TIMEZONE).format("HH:mm:ss");
  };

  const filteredBills = bills.filter(
    (b) => b.customer_name.toLowerCase().includes(search.toLowerCase()) || b.table_no.toString().split('|PROMO:')[0].includes(search)
  );

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-300">Open Bills</h1>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
    type="text"
    placeholder="Search bills..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="w-full pl-10 pr-4 py-2 dark:text-gray-300 rounded-xl border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none sm:w-64"
  />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredBills.map((bill) => {
    const total = bill.items.reduce((sum, i) => sum + Number(i.subtotal || 0), 0);
    return (
            <div key={bill.bill_id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
              <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">{bill.customer_name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Table {bill.table_no.split('|PROMO:')[0]}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 font-medium">{formatTime(bill.created_time || bill.created_at)}</p>
                  <p className="font-black text-blue-600">Rp {total.toLocaleString("id-ID")}</p>
                </div>
              </div>
              
              <div className="p-4 flex-1 overflow-y-auto max-h-48 space-y-2">
                {bill.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-gray-700 font-medium">{item.qty}x {item.menu_name}</span>
                    <span className="text-gray-500">Rp {Number(item.subtotal || 0).toLocaleString("id-ID")}</span>
                  </div>
                ))}
              </div>

              <div className="p-4 border-t bg-gray-50 dark:bg-gray-900 grid grid-cols-3 gap-2">
                <button
      onClick={() => handleEdit(bill)}
      className="flex items-center justify-center space-x-1.5 py-2 px-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-bold rounded-xl hover:bg-gray-50 dark:bg-gray-900 transition-colors text-xs"
    >
                  <Edit size={15} />
                  <span>Edit</span>
                </button>
                <button
                 onClick={() => handlePrintCaptain(bill)}
                  disabled={printingBillId === bill.bill_id}
                  className="flex items-center justify-center space-x-1.5 py-2 px-2.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold rounded-xl transition-colors shadow-sm text-xs cursor-pointer disabled:opacity-50"
                  title="Print Captain Order Ticket"
                >
                  <ChefHat size={15} className={printingBillId === bill.bill_id ? "animate-spin" : ""} />
                  <span>Captain</span>
                </button>
                <button
                  onClick={() => handleClose(bill)}
                  className="flex items-center justify-center space-x-1.5 py-2 px-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-md shadow-blue-200 text-xs"
    >
                  <CheckCircle size={15} />
                  <span>Close Bill</span>
                </button>
              </div>
            </div>
          );
  })}
        {filteredBills.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600">
            No open bills found.
          </div>
        )}
      </div>
    </div>
  );
}
export {
  OpenBills as default
};
