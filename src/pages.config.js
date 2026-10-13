/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AdminLogin from './pages/AdminLogin';
import PDV from './pages/PDV';
import PDVOrders from './pages/PDVOrders';
import Banners from './pages/Banners';
import Categories from './pages/Categories';
import Clients from './pages/Clients';
import Coupons from './pages/Coupons';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import Menu from './pages/Menu';
import MyOrders from './pages/MyOrders';
import Orders from './pages/Orders';
import PrintOrder from './pages/PrintOrder';
import PrintShiftClosing from './pages/PrintShiftClosing';
import Products from './pages/Products';
import Complements from './pages/Complements';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import SuperAdmin from './pages/SuperAdmin';
import KDS from './pages/KDS';
import DeliveryDrivers from './pages/DeliveryDrivers';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminLogin": AdminLogin,
    "SuperAdmin": SuperAdmin,
    "PDV": PDV,
    "PDVOrders": PDVOrders,
    "KDS": KDS,
    "DeliveryDrivers": DeliveryDrivers,
    "Banners": Banners,
    "Categories": Categories,
    "Clients": Clients,
    "Coupons": Coupons,
    "Dashboard": Dashboard,
    "Home": Home,
    "Menu": Menu,
    "MyOrders": MyOrders,
    "Orders": Orders,
    "PrintOrder": PrintOrder,
    "PrintShiftClosing": PrintShiftClosing,
    "Products": Products,
    "Complements": Complements,
    "Reports": Reports,
    "Settings": Settings,
}

export const pagesConfig = {
    mainPage: "Menu",
    Pages: PAGES,
    Layout: __Layout,
};