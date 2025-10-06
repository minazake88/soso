// ====================================================================
// 1. الإعدادات الأساسية والثوابت (CORE SETUP & CONSTANTS)
// ====================================================================
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDoc,
  setDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  deleteDoc,
  query,
  where,
  runTransaction,
  writeBatch,
  Timestamp,
  increment,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// --- Firebase Initialization ---
const firebaseConfig = {
  apiKey: 'AIzaSyCqjriBRFlJh08Yc6ZwCOeoVIE5y62xmVk',
  authDomain: 'mina-4e73c.firebaseapp.com',
  projectId: 'mina-4e73c',
  storageBucket: 'mina-4e73c.firebasestorage.app',
  messagingSenderId: '738756602020',
  appId: '1:738756602020:web:6dfaf9ac31e845f1db9e31',
  measurementId: 'G-87MTRRM83W',
};
const ADMIN_EMAIL = 'admin@factory.com'; // البريد الإلكتروني للمستخدم المدير
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- Global State Variables ---
let userId: string | null = null;
let authReady = false;
let userRole: 'owner' | 'office' | 'visitor' = 'visitor';
let isSubscribed = false; // حالة الاشتراك
let isRegistrationOpen = true; // حالة التسجيل العام
let defaultTrialDays = 14; // عدد الأيام التجريبية الافتراضية

interface UserPermissions {
  dashboard: boolean;
  cutting: boolean;
  workshops: boolean;
  delivery: boolean;
  accounts: boolean;
  settings: boolean;
  user_management: boolean;
  sales: boolean;
  customers: boolean;
  reports: boolean;
  [key: string]: boolean | undefined;
}
let userPermissions: UserPermissions = {} as UserPermissions;

// --- Data Caches ---
let allCuttings: any[] = [],
  allWorkshops: any[] = [],
  allAssignments: any[] = [],
  allCustomers: any[] = [],
  allInvoices: any[] = [],
  allTransactions: any[] = [];
let workshopPrices: {[key: string]: any[]} = {};
let allUsersMetadata: any[] = [];
let salesCart: any[] = [];
let notificationSettings = {
  noCutting: true,
  workshopBalance: true,
  cuttingHistory48hEnabled: true,
};

// --- Firebase References & Listeners Management ---
const APP_SETTINGS_REF = doc(db, 'app_settings', 'config');
let unsubscribers: (() => void)[] = [];
let workshopPriceUnsubs = new Map<string, () => void>();
let usersMetadataUnsub: (() => void) | null = null;

// --- Constants and UI Elements ---
const DEFAULT_PERMISSIONS: UserPermissions = {
  dashboard: true,
  cutting: false,
  workshops: false,
  delivery: false,
  accounts: false,
  settings: true,
  user_management: false,
  sales: true,
  customers: true,
  reports: true,
};

const NAV_LINKS = [
    { key: 'dashboard', label: 'لوحة التحكم', icon: 'fas fa-chart-line' },
    { key: 'cutting', label: 'القص', icon: 'fas fa-cut' },
    { key: 'workshops', label: 'الورش', icon: 'fas fa-tools' },
    { key: 'delivery', label: 'استلام القطع', icon: 'fas fa-dolly-flatbed' },
    { key: 'accounts', label: 'حسابات الورش', icon: 'fas fa-sack-dollar' },
    { key: 'sales', label: 'المبيعات', icon: 'fas fa-cash-register' },
    { key: 'customers', label: 'العملاء', icon: 'fas fa-users' },
    { key: 'reports', label: 'التقارير', icon: 'fas fa-chart-pie' },
    { key: 'settings', label: 'الإعدادات', icon: 'fas fa-cog' },
    { key: 'user_management', label: 'إدارة المستخدمين', icon: 'fas fa-users-gear' },
];


const authSection = document.getElementById('auth-section')!;
const mainContent = document.getElementById('main-content')!;
const googleSignInBtn = document.getElementById('google-signin-btn')!;
const anonymousSignInBtn = document.getElementById('anonymous-signin-btn')!;
const signOutBtn = document.getElementById('sign-out-btn')!;
const userInfoDisplay = document.getElementById('user-info-display')!;
const userRoleDisplay = document.getElementById('user-role-display')!;
const userManagementNavBtn = document.getElementById('user-management-nav-btn')!;
const subscriptionAlert = document.getElementById('subscription-status-alert')!;
const emailInput = document.getElementById('auth-email') as HTMLInputElement;
const passwordInput = document.getElementById('auth-password') as HTMLInputElement;
const emailSignInBtn = document.getElementById('email-signin-btn') as HTMLButtonElement;
const emailSignUpBtn = document.getElementById('email-signup-btn') as HTMLButtonElement;

// ====================================================================
// 2. الدوال المساعدة (UTILITIES & HELPERS)
// ====================================================================

function toTimestamp(date: Date | null) { return date ? Timestamp.fromDate(date) : null; }
function toDateString(timestamp: Timestamp | null) { if (!timestamp) return ''; const date = timestamp.toDate(); return date.toISOString().split('T')[0]; }
function addDaysToDate(date: Date, days: number) { const newDate = new Date(date); newDate.setDate(newDate.getDate() + days); return newDate; }

function showMessage(message: string, type = 'info') {
    const box = document.getElementById('message-box')!;
    box.textContent = message;
    box.className = 'p-4 rounded-lg shadow-2xl mb-4 text-center font-bold animate-pulse';
    if (type === 'success') box.classList.add('bg-green-500', 'text-white');
    else if (type === 'error') box.classList.add('bg-red-500', 'text-white');
    else box.classList.add('bg-blue-500', 'text-white');
    box.style.display = 'block';
    setTimeout(() => { box.style.display = 'none'; }, 5000);
}

function showCustomMessage(message: string, title = 'تنبيه') {
    const modal = document.getElementById('message-modal')!;
    document.getElementById('message-modal-title')!.textContent = title;
    document.getElementById('message-modal-content')!.textContent = message;
    modal.classList.add('active');
}

function showPermissionDeniedMessage(pageKey: string) {
    if (!isSubscribed) { return showCustomMessage('أنت غير مشترك في هذه الخدمة. يرجى التواصل معنا للتفعيل.', 'اشتراك منتهي/محدود'); }
    const pageLabel = NAV_LINKS.find((link) => link.key === pageKey)?.label || 'هذه الوظيفة';
    showCustomMessage(`ليس لديك صلاحية الوصول إلى ${pageLabel}.`, 'صلاحيات محدودة');
}

function closeModal(modalId: string) { document.getElementById(modalId)?.classList.remove('active'); }
(window as any).closeModal = closeModal;

function loadSettings() { try { const savedSettings = localStorage.getItem('factoryNotificationSettings'); if (savedSettings) { notificationSettings = JSON.parse(savedSettings); } } catch (e) { console.error('Error loading settings from localStorage:', e); } }
function saveSettings() { try { localStorage.setItem('factoryNotificationSettings', JSON.stringify(notificationSettings)); } catch (e) { console.error('Error saving settings to localStorage:', e); } }

async function resetFactoryData(reload = true) {
    if (!authReady || !userId) return showCustomMessage('الرجاء تسجيل الدخول أولاً.');
    const userPath = `users/${userId}`;
    const collectionsToDelete = ['cutting', 'assignments', 'transactions', 'workshops', 'customers', 'invoices'];
    try {
        showMessage('جاري استعادة إعدادات المصنع...', 'info');
        for (const colName of collectionsToDelete) {
            const colRef = collection(db, `${userPath}/${colName}`);
            const snapshot = await getDocs(colRef);
            if (snapshot.empty) continue;
            const batch = writeBatch(db);
            if (colName === 'workshops') {
                for (const workshopDoc of snapshot.docs) {
                    const pricesRef = collection(db, `${userPath}/workshops/${workshopDoc.id}/prices`);
                    const pricesSnapshot = await getDocs(pricesRef);
                    pricesSnapshot.forEach((priceDoc) => batch.delete(priceDoc.ref));
                    batch.delete(workshopDoc.ref);
                }
            } else { snapshot.forEach((doc) => batch.delete(doc.ref)); }
            await batch.commit();
        }
        const countersRef = doc(db, `users/${userId}/app_state/counters`);
        await setDoc(countersRef, { invoiceNumber: 0 });

        if (reload) {
            showMessage('تمت استعادة إعدادات المصنع بنجاح! سيتم إعادة تحميل الصفحة.', 'success');
            setTimeout(() => location.reload(), 2000);
        }
    } catch (error: any) {
        console.error('Error resetting factory data:', error);
        showMessage(`فشل استعادة الإعدادات: ${error.message}`, 'error');
    }
}

// ====================================================================
// 3. إدارة المصادقة وصلاحيات المستخدمين (AUTH & PERMISSIONS)
// ====================================================================

async function setupUserMetadata(uid: string, email: string, isNewUser: boolean) {
    const userRef = doc(db, 'users_metadata', uid);
    const userDoc = await getDoc(userRef);
    if (isNewUser && !userDoc.exists()) {
        const expiryDate = addDaysToDate(new Date(), defaultTrialDays);
        const isAdminUser = email === ADMIN_EMAIL;
        const role = isAdminUser ? 'owner' : 'office';
        let permissions = {...DEFAULT_PERMISSIONS};
        if(isAdminUser) {
            permissions = Object.fromEntries(NAV_LINKS.map(link => [link.key, true])) as UserPermissions;
        }

        await setDoc(userRef, {
            email: email,
            role: role,
            subscription_expires: toTimestamp(expiryDate),
            created_at: new Date(),
            trial_period_days: defaultTrialDays,
            permissions: permissions,
        });
        showMessage(`تم التسجيل بنجاح! لديك الآن فترة تجريبية لمدة ${defaultTrialDays} يوماً.`, 'success');
    }
}

async function checkUserAccessAndPermissions(user: any) {
    userRole = 'visitor';
    isSubscribed = false;
    userPermissions = {} as UserPermissions;

    if (user.isAnonymous) {
        isSubscribed = true;
        userRole = 'visitor';
        userPermissions = { ...DEFAULT_PERMISSIONS, accounts: false, user_management: false, cutting: false, workshops: false, delivery: false, sales: false, customers: false, reports: false };
        return;
    }

    try {
        await setupUserMetadata(user.uid, user.email || 'N/A', false);
        const userRef = doc(db, 'users_metadata', user.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
            const data = userDoc.data();
            const expiry = data.subscription_expires?.toDate() || new Date(0);
            
            isSubscribed = expiry > new Date();
            userRole = data.role || 'office';
            userPermissions = data.permissions || DEFAULT_PERMISSIONS;

            if (userRole === 'owner') {
                isSubscribed = true;
                userPermissions = Object.fromEntries(NAV_LINKS.map(link => [link.key.replace(/-/g, '_'), true])) as UserPermissions;
            }
        } else {
             userPermissions = DEFAULT_PERMISSIONS;
        }
    } catch (error) {
        console.error("Error fetching user metadata:", error);
        isSubscribed = false;
        userPermissions = {} as UserPermissions;
    }
}

function updateAuthUIButtons() {
    if (authReady) return;
    const signupButton = document.getElementById('email-signup-btn') as HTMLButtonElement;
    const googleSignupButton = document.getElementById('google-signin-btn') as HTMLButtonElement;
    let registrationHint = document.getElementById('registration-hint');
    if (isRegistrationOpen) {
        signupButton.disabled = false;
        googleSignupButton.disabled = false;
        if (registrationHint) registrationHint.classList.add('hidden');
    } else {
        signupButton.disabled = true;
        googleSignupButton.disabled = true;
        if (!registrationHint) {
            const formDiv = document.querySelector('#auth-section .bg-blue-50');
            if (formDiv) {
                const hint = document.createElement('p');
                hint.id = 'registration-hint';
                hint.className = 'text-sm text-red-600 font-bold mt-2';
                hint.textContent = 'تم إغلاق التسجيل الجديد مؤقتاً بواسطة المسؤول.';
                formDiv.appendChild(hint);
            }
        } else {
            registrationHint.classList.remove('hidden');
        }
    }
}

onAuthStateChanged(auth, async (user) => {
    unsubscribers.forEach((unsub) => unsub());
    workshopPriceUnsubs.forEach((unsub) => unsub());
    if (usersMetadataUnsub) usersMetadataUnsub();
    try { const settingsDoc = await getDoc(APP_SETTINGS_REF); const data = settingsDoc.data() || {}; isRegistrationOpen = data.isRegistrationOpen ?? true; defaultTrialDays = data.defaultTrialDays ?? 14; } catch (e) { console.error("Failed to fetch initial settings:", e); }

    if (user) {
        userId = user.uid;
        authReady = true;
        await checkUserAccessAndPermissions(user);
        const userName = user.isAnonymous ? 'مستخدم زائر' : user.email;
        userInfoDisplay.textContent = `مرحباً, ${userName}`;
        
        const roleTranslations = { owner: 'مالك النظام', office: 'مكتب', visitor: 'زائر' };
        userRoleDisplay.textContent = roleTranslations[userRole];
        userRoleDisplay.classList.remove('hidden');

        if (isSubscribed) {
            [userInfoDisplay, signOutBtn, mainContent].forEach((el) => el.classList.remove('hidden'));
            authSection.classList.add('hidden');
            subscriptionAlert.classList.add('hidden');
            
            document.querySelectorAll('.nav-button').forEach((btn) => {
                const pageKey = (btn as HTMLElement).dataset.page!.replace(/-/g, '_');
                const isPermitted = userPermissions[pageKey] === true;
                btn.classList.toggle('hidden', !isPermitted);
            });

            loadSettings();
            initListeners();
            renderAllPages();
        } else {
            [userInfoDisplay, signOutBtn].forEach((el) => el.classList.remove('hidden'));
            [mainContent, userManagementNavBtn].forEach((el) => el.classList.add('hidden'));
            authSection.classList.remove('hidden');
            subscriptionAlert.innerHTML = `**لا يمكن استخدام البرنامج إلا بعد تسديد الاشتراك.** يرجى التواصل عبر InstaPay على رقم **01127070634** (باسم: **مينا س ز ب و**) لإعادة تفعيل الاشتراك.`;
            subscriptionAlert.classList.remove('hidden');
        }
    } else {
        userId = null;
        authReady = false;
        isSubscribed = false;
        userRole = 'visitor';
        [userInfoDisplay, signOutBtn, mainContent, userRoleDisplay, userManagementNavBtn, subscriptionAlert].forEach((el) => el.classList.add('hidden'));
        authSection.classList.remove('hidden');
        updateAuthUIButtons();
        document.querySelectorAll('.nav-button').forEach((btn) => btn.classList.add('hidden'));
        document.querySelectorAll('.page').forEach(page => page.innerHTML = '');
    }
});

// ====================================================================
// 4. إدارة المستمعين (LISTENERS & DATA FETCHING)
// ====================================================================

function initListeners() {
    if (!authReady || !userId) return;
    unsubscribers.forEach((unsub) => unsub());
    workshopPriceUnsubs.forEach((unsub) => unsub());
    if (usersMetadataUnsub) usersMetadataUnsub();
    unsubscribers = [];
    workshopPriceUnsubs.clear();
    const userPath = `users/${userId}`;

    unsubscribers.push(onSnapshot(APP_SETTINGS_REF, (doc) => { const data = doc.data() || {}; isRegistrationOpen = data.isRegistrationOpen ?? true; defaultTrialDays = data.defaultTrialDays ?? 14; if (!authReady) updateAuthUIButtons(); if (userRole === 'owner') renderUserManagementPage(); }));
    unsubscribers.push(onSnapshot(collection(db, `${userPath}/cutting`), (snapshot) => { allCuttings = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); renderCuttingPage(); renderCuttings(); updateAllViews(); }));
    unsubscribers.push(onSnapshot(collection(db, `${userPath}/workshops`), (snapshot) => { const newWorkshops = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); const oldWorkshopIds = new Set(allWorkshops.map(w => w.id)); const newWorkshopIds = new Set(newWorkshops.map(w => w.id)); oldWorkshopIds.forEach(id => { if (!newWorkshopIds.has(id) && workshopPriceUnsubs.has(id)) { workshopPriceUnsubs.get(id)!(); workshopPriceUnsubs.delete(id); } }); allWorkshops = newWorkshops; renderWorkshops(); updateAllViews(); allWorkshops.forEach(workshop => { if (!workshopPriceUnsubs.has(workshop.id)) { const unsub = onSnapshot(collection(db, `${userPath}/workshops/${workshop.id}/prices`), (pricesSnapshot) => { workshopPrices[workshop.id] = pricesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); renderWorkshops(); updateAllViews(); }); workshopPriceUnsubs.set(workshop.id, unsub); } }); }));
    unsubscribers.push(onSnapshot(collection(db, `${userPath}/assignments`), (snapshot) => { allAssignments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); renderWorkshops(); renderDeliveryPage(); updateAllViews(); }));
    unsubscribers.push(onSnapshot(collection(db, `${userPath}/transactions`), (snapshot) => { allTransactions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); renderAccounts(); updateAllViews(); }));
    unsubscribers.push(onSnapshot(collection(db, `${userPath}/customers`), (snapshot) => { allCustomers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); renderCustomersPage(); }));
    unsubscribers.push(onSnapshot(collection(db, `${userPath}/invoices`), (snapshot) => { allInvoices = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); renderReportsPage(); renderCustomersPage(); }));
    if (userRole === 'owner') { usersMetadataUnsub = onSnapshot(collection(db, 'users_metadata'), (snapshot) => { allUsersMetadata = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); renderUserManagementPage(); }); }
}

function updateAllViews() {
    if (!authReady || !isSubscribed) return;
    renderDashboard();
    renderAccounts();
    renderSalesPage();
}

function renderAllPages() {
    if (!isSubscribed) return;
    NAV_LINKS.forEach(link => {
        if(userPermissions[link.key.replace(/-/g, '_')]) {
            const pageId = `${link.key}-page`;
            const renderFunc = window[`render${link.key.charAt(0).toUpperCase() + link.key.slice(1).replace(/_([a-z])/g, g => g[1].toUpperCase())}Page` as keyof Window];
            if (typeof renderFunc === 'function') {
                (renderFunc as Function)();
            }
        }
    });
    
    // Fallback renders for pages that need it
    renderCuttings();
    renderWorkshops();
    renderAccounts();

    const firstAvailableButton = document.querySelector('.nav-button:not(.hidden)');
    if (firstAvailableButton) {
        firstAvailableButton.classList.add('active');
        const targetPageId = `${(firstAvailableButton as HTMLElement).dataset.page}-page`;
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(targetPageId)?.classList.add('active');
    }
}
// Placeholder for render functions not fully defined to avoid TS errors
declare global { interface Window { renderSalesPage: Function; renderCustomersPage: Function; renderReportsPage: Function; renderCuttingPage: Function; renderWorkshopsPage: Function; renderDeliveryPage: Function; renderAccountsPage: Function; renderSettingsPage: Function; renderUserManagementPage: Function; } }
window.renderSalesPage = renderSalesPage;
window.renderCustomersPage = renderCustomersPage;
window.renderReportsPage = renderReportsPage;
window.renderCuttingPage = renderCuttingPage;
window.renderWorkshopsPage = renderWorkshopsPage;
window.renderDeliveryPage = renderDeliveryPage;
window.renderAccountsPage = renderAccounts;
window.renderSettingsPage = renderSettingsPage;
window.renderUserManagementPage = renderUserManagementPage;

// ====================================================================
// ... (EXISTING FUNCTIONS FOR CUTTING, WORKSHOPS, DELIVERY, ACCOUNTS)
// The existing functions from the original file should be pasted here.
// I will only show the NEW and MODIFIED functions below to save space.
// ====================================================================

// --- [EXISTING CODE from original file for sections 5, 6, 7, 8, 9, 10, 11] ---
// --- [START OF PASTED EXISTING CODE] ---
// ====================================================================
// 5. إدارة القص والتوزيع (CUTTING & ASSIGNMENT LOGIC)
// ====================================================================

/**
 * حذف قصة بالكامل (يتم التحقق من عدم وجود توزيعات نشطة لها أولاً)
 */
async function deleteCutting(cuttingId: string) {
  if (!userId) return showMessage('الرجاء تسجيل الدخول أولاً.', 'error');

  try {
    const assignmentsQuery = query(
      collection(db, `users/${userId}/assignments`),
      where('cuttingId', '==', cuttingId),
    );
    const assignmentsSnapshot = await getDocs(assignmentsQuery);

    if (!assignmentsSnapshot.empty) {
      showCustomMessage('لا يمكن حذف هذه القصة. يوجد لديها عمليات توزيع مسجلة.');
      return;
    }

    await deleteDoc(doc(db, `users/${userId}/cutting`, cuttingId));
    showMessage('تم حذف القصة بنجاح!', 'success');
  } catch (err: any) {
    console.error('Error deleting cutting:', err);
    showMessage(`فشل حذف القصة: ${err.message}`, 'error');
  }
}

/**
 * وضع علامة "تم البيع" على قصة مكتملة
 */
async function markAsSold(cuttingId: string) {
  if (!userId) {
    showCustomMessage('الرجاء تسجيل الدخول أولاً.');
    return;
  }
  try {
    const cuttingRef = doc(db, `users/${userId}/cutting`, cuttingId);
    await updateDoc(cuttingRef, {status: 'Sold'});
    showMessage(
      'تم وضع علامة "تم البيع" على القصة بنجاح وإزالتها من السجل المؤقت!',
      'success',
    );
  } catch (err: any) {
    console.error('Error marking cutting as sold:', err);
    showMessage(`فشل وضع علامة "تم البيع" على القصة: ${err.message}`, 'error');
  }
}

// Fix: Add the missing function definition for showDeleteCuttingConfirmModal
function showDeleteCuttingConfirmModal(cuttingId: string) {
  const modal = document.getElementById('delete-cutting-confirm-modal');
  const confirmBtn = document.getElementById('confirm-delete-cutting-btn');
  if (!modal || !confirmBtn) return;

  const newConfirmBtn = confirmBtn.cloneNode(true) as HTMLButtonElement;
  confirmBtn.parentNode!.replaceChild(newConfirmBtn, confirmBtn);

  newConfirmBtn.onclick = async () => {
    await deleteCutting(cuttingId);
    closeModal('delete-cutting-confirm-modal');
  };

  modal.classList.add('active');
}

/**
 * حفظ عملية توزيع جديدة للورشة (Assign)
 */
async function saveAssignment(cuttingId: string, workshopId: string, assignedSizes: any[], saveButton: HTMLButtonElement) {
  let totalAssigned = assignedSizes.reduce((sum, s) => sum + s.quantity, 0);

  if (totalAssigned === 0 || !workshopId) {
    showMessage(
      'الرجاء تحديد ورشة وإدخال الكميات المراد توزيعها.',
      'error',
    );
    saveButton.disabled = false;
    return;
  }

  try {
    await runTransaction(db, async (transaction) => {
      const cuttingRef = doc(db, `users/${userId}/cutting`, cuttingId);
      const cuttingDoc = await transaction.get(cuttingRef);
      if (!cuttingDoc.exists()) {
        throw new Error('لم يتم العثور على مستند القص!');
      }
      const currentSizes = cuttingDoc.data().sizes;
      let newRemaining = cuttingDoc.data().remaining_pieces;

      const newSizes = currentSizes.map((s: any) => {
        const assigned = assignedSizes.find((a) => a.size_name === s.size_name);
        if (assigned) {
          if (s.quantity < assigned.quantity) {
            throw new Error(`كمية غير كافية للمقاس ${s.size_name}.`);
          }
          newRemaining -= assigned.quantity;
          return {...s, quantity: s.quantity - assigned.quantity};
        }
        return s;
      });

      const newStatus = newRemaining === 0 ? 'Completed' : 'In Progress';

      transaction.update(cuttingRef, {
        remaining_pieces: newRemaining,
        sizes: newSizes,
        status: newStatus,
        finished_at: newStatus === 'Completed' ? new Date() : null,
      });

      const newAssignmentRef = doc(collection(db, `users/${userId}/assignments`));
      transaction.set(newAssignmentRef, {
        cuttingId,
        workshopId,
        workshopName: allWorkshops.find((w) => w.id === workshopId)?.name,
        assigned_sizes: assignedSizes,
        total_quantity: totalAssigned,
        status: 'In Progress',
        created_at: new Date(),
      });
    });

    const successMessage = `تم حفظ توزيع ${totalAssigned} قطعة بنجاح!`;
    showMessage(successMessage, 'success');
    closeModal('assign-modal');
  } catch (err: any) {
    console.error('Assignment error:', err);
    showMessage(`فشل التوزيع: ${err.message}`, 'error');
  } finally {
    saveButton.disabled = false;
  }
}

/**
 * زيادة كمية القص ثم التوزيع (عندما تكون الكمية المطلوبة أكبر من المتاحة)
 */
async function increaseCuttingAndAssign(
  cuttingId: string,
  workshopId: string,
  sizesData: any[],
  saveButton: HTMLButtonElement,
) {
  let assignedSizes = sizesData
    .filter((s) => s.quantity > 0)
    .map((s) => ({
      size_name: s.size_name,
      quantity: s.quantity,
      delivered: 0,
      delivery_history: [],
    }));

  let totalAssigned = assignedSizes.reduce((sum, s) => sum + s.quantity, 0);

  if (totalAssigned === 0 || !workshopId) {
    showMessage(
      'الرجاء تحديد ورشة وإدخال الكميات المراد توزيعها.',
      'error',
    );
    saveButton.disabled = false;
    return;
  }

  try {
    await runTransaction(db, async (transaction) => {
      const cuttingRef = doc(db, `users/${userId}/cutting`, cuttingId);
      const cuttingDoc = await transaction.get(cuttingRef);
      if (!cuttingDoc.exists()) {
        throw new Error('لم يتم العثور على مستند القص الأصلي!');
      }

      const cuttingData = cuttingDoc.data();
      let newTotalPieces = cuttingData.total_pieces;
      let newRemainingPieces = cuttingData.remaining_pieces;
      const newSizes = JSON.parse(JSON.stringify(cuttingData.sizes));

      sizesData.forEach((requestedSize) => {
        if (requestedSize.quantity > requestedSize.max) {
          const increaseBy = requestedSize.quantity - requestedSize.max;
          newTotalPieces += increaseBy;
          newRemainingPieces += increaseBy;

          const sizeIndex = newSizes.findIndex(
            (s: any) => s.size_name === requestedSize.size_name,
          );
          if (sizeIndex !== -1) {
            newSizes[sizeIndex].quantity += increaseBy;
          } else {
            newSizes.push({
              size_name: requestedSize.size_name,
              quantity: increaseBy,
            });
          }
        }
      });

      let finalRemainingPieces = newRemainingPieces;
      const finalSizesAfterAssignment = newSizes.map((s: any) => {
        const assigned = assignedSizes.find((a) => a.size_name === s.size_name);
        if (assigned) {
          finalRemainingPieces -= assigned.quantity;
          return {...s, quantity: s.quantity - assigned.quantity};
        }
        return s;
      });

      const newStatus = finalRemainingPieces === 0 ? 'Completed' : 'In Progress';

      transaction.update(cuttingRef, {
        total_pieces: newTotalPieces,
        remaining_pieces: finalRemainingPieces,
        sizes: finalSizesAfterAssignment,
        status: newStatus,
        finished_at: newStatus === 'Completed' ? new Date() : null,
      });

      const newAssignmentRef = doc(collection(db, `users/${userId}/assignments`));
      transaction.set(newAssignmentRef, {
        cuttingId,
        workshopId,
        workshopName: allWorkshops.find((w) => w.id === workshopId)?.name,
        assigned_sizes: assignedSizes,
        total_quantity: totalAssigned,
        status: 'In Progress',
        created_at: new Date(),
      });
    });

    const successMessage = `تم زيادة كمية القص وتوزيع ${totalAssigned} قطعة بنجاح!`;
    showMessage(successMessage, 'success');
    closeModal('assign-modal');
  } catch (err: any) {
    console.error('Increase and assign error:', err);
    showMessage(`فشل العملية: ${err.message}`, 'error');
  } finally {
    saveButton.disabled = false;
  }
}

/**
 * عرض صفحة القص (بما في ذلك نموذج الإضافة)
 */
function renderCuttingPage() {
  const page = document.getElementById('cutting-page')!;
  page.innerHTML = `
                <h2 class="text-3xl font-extrabold text-center mb-6 text-gray-900">صفحة القص وتوزيع القطع</h2>
                <div class="space-y-6">
                    <div class="p-6 bg-blue-50 rounded-xl mb-6 shadow-xl border-t-4 border-blue-600">
                        <h3 class="text-2xl font-semibold mb-4 text-blue-800">إضافة قص جديد</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="w-full">
                                <label for="cutting-model-name" class="block text-sm font-medium">اسم الموديل</label>
                                <input type="text" id="cutting-model-name" list="model-names-list" class="p-3 mt-1 block w-full rounded-lg shadow-sm border-2 border-blue-300" placeholder="اختر موديل سابق أو أدخل اسم جديد...">
                                <datalist id="model-names-list"></datalist>
                            </div>
                            <div class="w-full">
                                <label for="cutting-total-layers" class="block text-sm font-medium">عدد الراق</label>
                                <div class="flex items-center gap-2 mt-1 flex-wrap">
                                    <input type="number" id="cutting-total-layers" class="p-3 block rounded-lg shadow-sm border-2 border-blue-300 flex-grow min-w-[100px]" placeholder="أدخل العدد..." value="1">
                                    <button type="button" class="p-3 bg-gray-200 rounded-lg multiply-layers-btn whitespace-nowrap hover:bg-gray-300" data-multiplier="2">x 2</button>
                                    <button type="button" class="p-3 bg-gray-200 rounded-lg multiply-layers-btn whitespace-nowrap hover:bg-gray-300" data-multiplier="3">x 3</button>
                                    <div class="flex items-center border-2 border-blue-300 rounded-lg overflow-hidden bg-white shadow-sm">
                                        <input type="number" id="custom-multiplier" class="p-3 w-24 border-0 focus:ring-0" placeholder="مخصص">
                                        <button type="button" id="custom-multiply-btn" class="px-4 py-3 bg-blue-600 text-white h-full hover:bg-blue-700">ضرب</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="mt-6">
                            <h4 class="text-lg font-semibold mb-3 text-blue-800 border-b pb-1">اختر المقاسات</h4>
                            <div id="suggested-sizes-container" class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 p-4 bg-gray-100 rounded-xl shadow-inner mb-4">
                                <!-- Checkboxes will be populated by JS -->
                            </div>
                            <div class="flex flex-col md:flex-row gap-4">
                                <input type="text" id="cutting-size-name" placeholder="أو أضف مقاس جديد يدوياً..." class="p-3 block w-full rounded-lg shadow-sm border-2 border-blue-300">
                                <button id="manual-add-size-btn" class="w-full md:w-auto p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md whitespace-nowrap">إضافة مقاس</button>
                            </div>
                        </div>

                        <h4 class="text-lg font-semibold mt-6 mb-3 text-blue-800 border-b pb-1">المقاسات المحددة للقصة الحالية:</h4>
                        <div id="cutting-sizes-list" class="space-y-2 p-4 mt-2 bg-white rounded-xl shadow-inner min-h-[50px] border border-gray-200">
                            <p class="text-gray-500 text-center">لم يتم تحديد مقاسات بعد.</p>
                        </div>
                    </div>
                    <button id="save-cutting-btn" class="w-full p-4 bg-green-600 text-white font-extrabold text-xl rounded-lg hover:bg-green-700 shadow-xl transition-all">
                        <i class="fas fa-save ml-2"></i> حفظ القص الجديد
                    </button>
                </div>
                <div class="mt-8 p-6 bg-white rounded-xl shadow-xl border-t-4 border-gray-400">
                    <h3 class="text-2xl font-extrabold mb-4 text-gray-800">قائمة القص الجاري (In Progress)</h3>
                    <div id="cutting-list-container"></div>
                </div>
                <div id="completed-cutting-list" class="mt-8 p-6 bg-gray-50 rounded-xl shadow-xl border-t-4 border-yellow-400">
                    <h3 class="text-2xl font-extrabold mb-4 text-gray-800">سجل القص المكتمل </h3>
                    <div id="completed-cutting-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
                    <button id="view-full-cutting-history-btn" class="mt-6 w-full p-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700 shadow-md">عرض السجل الكامل للقص المكتمل</button>
                </div>`;

  // Populate model suggestions
  const modelDatalist = document.getElementById('model-names-list')!;
  const uniqueModelNames = [
    ...new Set(allCuttings.map((c) => c.model_name).filter(Boolean)),
  ];
  modelDatalist.innerHTML = uniqueModelNames
    .map((name) => `<option value="${name}"></option>`)
    .join('');

  let currentCuttingSizes: string[] = [];
  // Fix: Cast elements to their specific types
  const layersInput = document.getElementById('cutting-total-layers') as HTMLInputElement;
  const modelNameInput = document.getElementById('cutting-model-name') as HTMLInputElement;
  const sizeInput = document.getElementById('cutting-size-name') as HTMLInputElement;
  const sizesList = document.getElementById('cutting-sizes-list')!;
  const suggestedSizesContainer = document.getElementById(
    'suggested-sizes-container',
  )!;

  // --- Double Submission Fix: Cloning for multiplication buttons ---
  document.querySelectorAll('.multiply-layers-btn').forEach((btn) => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode!.replaceChild(newBtn, btn);
    // Fix: Cast newBtn to HTMLElement to access dataset
    (newBtn as HTMLElement).addEventListener('click', () => {
      const multiplier = parseInt((newBtn as HTMLElement).dataset.multiplier!, 10);
      const currentValue = parseInt(layersInput.value, 10) || 1;
      layersInput.value = (currentValue * multiplier).toString();
    });
  });

  const customMultiplyBtn = document.getElementById('custom-multiply-btn')!;
  const newCustomMultiplyBtn = customMultiplyBtn.cloneNode(true);
  customMultiplyBtn.parentNode!.replaceChild(newCustomMultiplyBtn, customMultiplyBtn);
  newCustomMultiplyBtn.addEventListener('click', () => {
    const customMultiplierInput = document.getElementById('custom-multiplier') as HTMLInputElement;
    const multiplier = parseInt(customMultiplierInput.value, 10);
    if (isNaN(multiplier) || multiplier <= 0) {
      showMessage(
        'الرجاء إدخال رقم صحيح وموجب في خانة الضرب المخصص.',
        'error',
      );
      return;
    }
    const currentValue = parseInt(layersInput.value, 10) || 1;
    layersInput.value = (currentValue * multiplier).toString();
    customMultiplierInput.value = '';
  });

  // Populate size suggestions
  const allUsedSizes = allCuttings.flatMap((c) =>
    (c.sizes || []).map((s: any) => s.size_name || s),
  );
  const uniqueSizes = [...new Set(allUsedSizes.filter(Boolean))].sort();

  suggestedSizesContainer.innerHTML =
    uniqueSizes.length > 0
      ? uniqueSizes
          .map(
            (size) => `
                <label class="flex items-center space-x-2 space-x-reverse p-2 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-blue-50 transition-all border-2 border-transparent has-[:checked]:border-blue-500 has-[:checked]:ring-2 has-[:checked]:ring-blue-200">
                    <input type="checkbox" class="form-checkbox h-5 w-5 text-blue-600 rounded focus:ring-0 focus:ring-offset-0" value="${size}">
                    <span class="text-gray-700 font-medium">${size}</span>
                </label>
            `,
          )
          .join('')
      : '<p class="text-center text-gray-500 col-span-full text-center">لا توجد مقاسات محفوظة سابقاً.</p>';

  const renderSizes = () => {
    if (currentCuttingSizes.length === 0) {
      sizesList.innerHTML =
        '<p class="text-gray-500 text-center">لم يتم تحديد مقاسات بعد.</p>';
      return;
    }
    sizesList.innerHTML = currentCuttingSizes
      .map(
        (size, index) => `<div class="flex items-center justify-between p-3 bg-gray-100 rounded-xl shadow-inner border border-gray-200">
                    <p class="font-bold text-lg">${size}</p>
                    <button class="text-red-500 hover:text-red-700 remove-size-btn p-1" data-index="${index}"><i class="fas fa-trash-alt"></i></button>
                </div>`,
      )
      .join('');

    // Note: remove-size-btn listeners must be re-attached here as innerHTML cleared them
    document.querySelectorAll('.remove-size-btn').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        // Fix: Cast currentTarget to HTMLElement
        const indexToRemove = parseInt((e.currentTarget as HTMLElement).dataset.index!);
        const sizeToRemove = currentCuttingSizes[indexToRemove];
        currentCuttingSizes.splice(indexToRemove, 1);
        
        // Fix: Cast checkbox to HTMLInputElement
        const checkbox = suggestedSizesContainer.querySelector(
          `input[value="${sizeToRemove}"]`,
        ) as HTMLInputElement | null;
        if (checkbox) checkbox.checked = false;

        renderSizes();
      }),
    );
  };

  suggestedSizesContainer.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.type === 'checkbox') {
      const size = target.value;
      if (target.checked) {
        if (!currentCuttingSizes.includes(size)) {
          currentCuttingSizes.push(size);
        }
      } else {
        currentCuttingSizes = currentCuttingSizes.filter((s) => s !== size);
      }
      renderSizes();
    }
  });

  // --- Double Submission Fix: Cloning for manual add size button ---
  const manualAddSizeBtn = document.getElementById('manual-add-size-btn')!;
  const newManualAddSizeBtn = manualAddSizeBtn.cloneNode(true);
  manualAddSizeBtn.parentNode!.replaceChild(newManualAddSizeBtn, manualAddSizeBtn);

  newManualAddSizeBtn.addEventListener('click', () => {
    const sizeName = sizeInput.value.trim();
    if (!sizeName) return showMessage('الرجاء إدخال اسم مقاس.', 'error');
    if (currentCuttingSizes.includes(sizeName))
      return showMessage('هذا المقاس موجود بالفعل.', 'error');

    currentCuttingSizes.push(sizeName);
    sizeInput.value = '';
    renderSizes();
  });

  // --- Double Submission Fix: Cloning for save cutting button ---
  const saveCuttingBtn = document.getElementById('save-cutting-btn')!;
  const newSaveCuttingBtn = saveCuttingBtn.cloneNode(true) as HTMLButtonElement;
  saveCuttingBtn.parentNode!.replaceChild(newSaveCuttingBtn, saveCuttingBtn);

  // --- Permission Check for Save Cutting ---
  if (!userPermissions.cutting) {
    newSaveCuttingBtn.disabled = true;
    newSaveCuttingBtn.title = 'ليس لديك صلاحية لحفظ قص جديد.';
    newSaveCuttingBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showPermissionDeniedMessage('cutting');
    });
  } else {
    newSaveCuttingBtn.addEventListener('click', async (e) => {
      const totalLayers = parseInt(layersInput.value, 10);
      const modelName = modelNameInput.value.trim();
      if (
        !modelName ||
        isNaN(totalLayers) ||
        totalLayers <= 0 ||
        currentCuttingSizes.length === 0
      )
        return showMessage(
          'الرجاء إدخال اسم الموديل وعدد الراق وإضافة المقاسات.',
          'error',
        );
      (e.target as HTMLButtonElement).disabled = true;
      try {
        await addDoc(collection(db, `users/${userId!}/cutting`), {
          model_name: modelName,
          total_layers: totalLayers,
          total_pieces: totalLayers * currentCuttingSizes.length,
          remaining_pieces: totalLayers * currentCuttingSizes.length,
          received_pieces: 0,
          created_at: new Date(),
          finished_at: null,
          status: 'In Progress',
          sizes: currentCuttingSizes.map((size) => ({
            size_name: size,
            quantity: totalLayers,
          })),
        });
        showMessage('تم حفظ القص بنجاح!', 'success');
        modelNameInput.value = '';
        layersInput.value = '1';
        sizeInput.value = '';
        currentCuttingSizes = [];

        suggestedSizesContainer
          .querySelectorAll('input[type="checkbox"]')
          // Fix: Cast cb to HTMLInputElement
          .forEach((cb) => ((cb as HTMLInputElement).checked = false));

        renderSizes();
      } catch (err: any) {
        showMessage(`فشل الحفظ: ${err.message}`, 'error');
      } finally {
        (e.target as HTMLButtonElement).disabled = false;
      }
    });
  }

  // New event listener for the full history button
  const viewHistoryBtn = document.getElementById(
    'view-full-cutting-history-btn',
  )!;
  const newViewHistoryBtn = viewHistoryBtn.cloneNode(true);
  viewHistoryBtn.parentNode!.replaceChild(newViewHistoryBtn, viewHistoryBtn);
  newViewHistoryBtn.addEventListener('click', openCompletedCuttingHistoryModal);
}

/**
 * عرض قائمة القص الجاري والقص المكتمل
 */
function renderCuttings() {
  const container = document.getElementById('cutting-list-container');
  const completedContainer = document.getElementById(
    'completed-cutting-container',
  );
  if (!container || !completedContainer) return;

  const now = new Date();
  const completedAndSoldCutts = allCuttings.filter(
    (c) => c.status === 'Completed' || c.status === 'Sold',
  );
  const activeCutts = allCuttings.filter((c) => c.status === 'In Progress');

  // Render active cuttings
  if (activeCutts.length === 0) {
    container.innerHTML =
      '<p class="text-center text-gray-500 mt-4 p-4 text-xl">لا توجد قصص قيد العمل يرجي تجهيز القص يا فــــاندم.</p>';
  } else {
    // Fix: Type the accumulator for reduce
    const groupedActiveCuttings = activeCutts.reduce<{ [key: string]: typeof allCuttings }>((acc, current) => {
      const model = current.model_name || 'غير محدد';
      if (!acc[model]) {
        acc[model] = [];
      }
      acc[model].push(current);
      return acc;
    }, {});

    let activeHtml = '';
    for (const model in groupedActiveCuttings) {
      groupedActiveCuttings[model].sort(
        (a, b) => b.created_at.toMillis() - a.created_at.toMillis(),
      );

      activeHtml += `
                        <div class="mt-4">
                            <h4 class="text-2xl font-extrabold mb-4 text-blue-700 border-b pb-2">${model}</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        `;
      groupedActiveCuttings[model].forEach((data) => {
        const sizesHtml = (data.sizes || [])
          .filter((s: any) => s.quantity > 0)
          .map(
            (s: any) =>
              `<p class="text-sm font-medium"><strong>${s.size_name}:</strong> ${s.quantity} قطعة</p>`,
          )
          .join('');
        const canAssign = data.remaining_pieces > 0;
        activeHtml += `
                            <div class="p-4 border-2 border-gray-200 rounded-xl shadow-lg flex flex-col bg-white">
                                <p class="text-gray-600"><strong>عدد الراق:</strong> ${data.total_layers}</p>
                                <p class="text-lg font-extrabold text-blue-800">الإجمالي: ${data.total_pieces}</p>
                                <p class="text-lg font-extrabold">المتبقي: <b class="text-red-600">${data.remaining_pieces}</b></p>
                                <p class="text-xs text-gray-500"><strong>تاريخ الإنشاء:</strong> ${data.created_at.toDate().toLocaleString('ar-EG')}</p>
                                <div class="mt-4 p-3 bg-gray-50 rounded-lg flex-grow border border-gray-200">
                                    <p class="font-bold mb-2 text-gray-700">المقاسات المتبقية:</p>
                                    ${sizesHtml || '<p class="text-red-500">لا توجد مقاسات متبقية للتوزيع</p>'}
                                </div>
                                <div class="flex flex-wrap gap-2 mt-4">
                                    ${canAssign ? `<button class="p-3 flex-grow bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 assign-pieces-btn shadow-md" data-id="${data.id}"><i class="fas fa-people-carry"></i> توزيع القطع</button>` : `<p class="p-3 text-center flex-grow bg-green-600 text-white font-bold rounded-lg shadow-md">تم توزيع كل القطع</p>`}
                                    <button class="p-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 delete-cutting-btn shadow-md" data-id="${data.id}"><i class="fas fa-trash-alt"></i></button>
                                </div>
                            </div>
                        `;
      });
      activeHtml += `
                            </div>
                        </div>
                    `;
    }
    container.innerHTML = activeHtml;
  }

  // Render recent completed/sold cuttings (48h history based on settings)
  let completedHtml = '';
  if (notificationSettings.cuttingHistory48hEnabled) {
    const recentCutts = completedAndSoldCutts.filter((data) => {
      const finishedDate = data.finished_at
        ? data.finished_at.toDate()
        : data.created_at.toDate();
      return (now.getTime() - finishedDate.getTime()) / (1000 * 60 * 60) <= 48;
    });

    completedHtml = recentCutts
      .map((data) => {
        const sizesHtml = (data.sizes || [])
          .map(
            (s: any) =>
              `<p class="text-sm font-medium"><strong>${s.size_name}:</strong> ${s.quantity} قطعة</p>`,
          )
          .join('');
        const finishedDate = data.finished_at
          ? data.finished_at.toDate().toLocaleString('ar-EG')
          : 'غير محدد';
        const statusText =
          data.status === 'Sold' ? 'تم البيع ✅' : 'مكتملة (متاحة للبيع) 📦';
        const statusBg = data.status === 'Sold' ? 'bg-green-600' : 'bg-yellow-600';
        const buttonHtml =
          data.status === 'Completed'
            ? `<button class="mt-4 p-2 w-full ${statusBg} text-white font-bold rounded-lg hover:bg-green-700 mark-sold-btn shadow-md" data-id="${data.id}"><i class="fas fa-check-circle ml-2"></i> تم البيع</button>`
            : `<p class="mt-4 p-2 w-full text-center ${statusBg} text-white font-bold rounded-lg shadow-md">تم بيع القصة</p>`;

        return `
                        <div class="p-4 border-2 border-gray-300 rounded-xl shadow-lg flex flex-col ${data.status === 'Sold' ? 'bg-green-50' : 'bg-gray-100'}">
                            <p class="font-bold text-lg text-gray-800">الموديل: ${data.model_name || 'غير محدد'}</p>
                            <p class="text-sm text-gray-600">الإجمالي: ${data.total_pieces}</p>
                            <p class="text-sm font-bold text-white p-1 rounded-md text-center ${statusBg} inline-block">${statusText}</p>
                            <p class="text-xs text-gray-500 mt-1"><strong>تاريخ الإجراء:</strong> ${finishedDate}</p>
                            <div class="mt-3 p-2 bg-white rounded-lg flex-grow border border-gray-200">
                                <p class="font-bold mb-2 text-gray-700">المقاسات الأصلية:</p>
                                ${sizesHtml}
                            </div>
                            ${buttonHtml}
                        </div>
                    `;
      })
      .join('');
  }
  completedContainer.innerHTML =
    completedHtml ||
    '<p class="text-center text-gray-500 p-4">لا توجد قصص مكتملة حالياً. (يمكن تفعيل سجل الـ 48 ساعة من الإعدادات)</p>';

  document.querySelectorAll('.assign-pieces-btn').forEach((btn) => {
    const newBtn = btn.cloneNode(true) as HTMLButtonElement;
    btn.parentNode!.replaceChild(newBtn, btn);
    if (!userPermissions.cutting) {
      newBtn.disabled = true;
      newBtn.title = 'ليس لديك صلاحية للتوزيع.';
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showPermissionDeniedMessage('cutting');
      });
    } else {
      newBtn.addEventListener('click', (e) => {
        const cuttingId = (e.target as HTMLElement).dataset.id!;
        openAssignModal(cuttingId);
      });
    }
  });

  document.querySelectorAll('.delete-cutting-btn').forEach((btn) => {
    const newBtn = btn.cloneNode(true) as HTMLButtonElement;
    btn.parentNode!.replaceChild(newBtn, btn);
    if (!userPermissions.cutting) {
      newBtn.disabled = true;
      newBtn.title = 'ليس لديك صلاحية للحذف.';
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showPermissionDeniedMessage('cutting');
      });
    } else {
      newBtn.addEventListener('click', (e) => {
        const cuttingId = (e.target as HTMLElement).dataset.id!;
        showDeleteCuttingConfirmModal(cuttingId);
      });
    }
  });

  document.querySelectorAll('.mark-sold-btn').forEach((btn) => {
    const newBtn = btn.cloneNode(true) as HTMLButtonElement;
    btn.parentNode!.replaceChild(newBtn, btn);
    if (!userPermissions.cutting) {
      newBtn.disabled = true;
      newBtn.title = 'ليس لديك صلاحية لتحديد كبيع.';
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showPermissionDeniedMessage('cutting');
      });
    } else {
      newBtn.addEventListener('click', (e) => {
        const cuttingId = (e.target as HTMLElement).dataset.id!;
        markAsSold(cuttingId);
      });
    }
  });
}

/**
 * عرض النافذة المنبثقة للتوزيع
 */
function openAssignModal(cuttingId: string) {
  const modal = document.getElementById('assign-modal')!;
  const cutting = allCuttings.find((c) => c.id === cuttingId);
  if (!cutting) return showMessage('القص غير موجود.', 'error');

  if (cutting.remaining_pieces <= 0) {
    return showMessage('لا توجد قطع متبقية لتوزيعها من هذا القص.', 'error');
  }

  const workshopOptions = allWorkshops
    .map((w) => `<option value="${w.id}">${w.name}</option>`)
    .join('');
  const sizeInputs = cutting.sizes
    .map((s: any) => {
      const availableQuantity = allCuttings
        .find((c) => c.id === cuttingId)
        .sizes.find((size: any) => size.size_name === s.size_name).quantity;
      if (availableQuantity > 0) {
        return `
                        <div class="flex flex-col md:flex-row md:items-center gap-2 p-3 bg-gray-50 rounded-lg shadow-inner">
                            <label class="w-full md:w-1/3 font-medium">${s.size_name} (<span class="text-red-600">${availableQuantity}</span> متاح):</label>
                            <div class="flex items-center w-full md:w-2/3 gap-2">
                                <input type="number" id="assign-size-${s.size_name.replace(/\s/g, '_')}" data-size="${s.size_name}" data-max="${availableQuantity}" class="p-2 w-full border rounded-lg text-center" value="0" min="0">
                                <button type="button" onclick="document.getElementById('assign-size-${s.size_name.replace(/\s/g, '_')}').value = Math.floor(${availableQuantity} / 2)" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg whitespace-nowrap text-sm">نصف</button>
                                <button type="button" onclick="document.getElementById('assign-size-${s.size_name.replace(/\s/g, '_')}').value = ${availableQuantity}" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg whitespace-nowrap text-sm">كامل</button>
                            </div>
                        </div>`;
      }
      return '';
    })
    .join('');

  // Apply fixed structure to enable scrolling for content
  modal.innerHTML = `
                <div class="modal-content-wrapper container-card border-t-4 border-blue-600">
                    <div class="modal-header flex justify-between items-center border-b pb-3 mb-4">
                        <h3 class="text-2xl font-bold text-gray-800">توزيع قطع من قص: ${cutting.model_name}</h3>
                        <button onclick="closeModal('assign-modal')" class="text-red-500 hover:text-red-700 p-2 rounded-full bg-gray-100 w-10 h-10 flex items-center justify-center">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body space-y-4">
                        <div class="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <label class="w-1/3 font-bold text-blue-800">اختيار الورشة:</label>
                            <select id="assign-workshop" class="p-3 w-full border rounded-lg shadow-sm">${workshopOptions}</select>
                        </div>
                        ${sizeInputs}
                    </div>
                    <div class="modal-footer flex justify-end gap-4 mt-6 border-t pt-4">
                        <button id="save-assignment-btn" data-cutting-id="${cuttingId}" class="p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold shadow-md"><i class="fas fa-hand-holding-box ml-2"></i> حفظ التوزيع</button>
                        <button onclick="closeModal('assign-modal')" class="p-3 bg-gray-400 text-white rounded-lg hover:bg-gray-500 font-bold">إلغاء</button>
                    </div>
                </div>`;
  modal.classList.add('active');

  // --- Double Submission Fix: Cloning for save assignment button ---
  const saveAssignmentBtn = document.getElementById('save-assignment-btn')!;
  const newSaveAssignmentBtn = saveAssignmentBtn.cloneNode(true);
  saveAssignmentBtn.parentNode!.replaceChild(
    newSaveAssignmentBtn,
    saveAssignmentBtn,
  );

  newSaveAssignmentBtn.addEventListener('click', async (e) => {
    const target = e.target as HTMLButtonElement;
    const cuttingId = target.dataset.cuttingId!;
    const workshopId = (document.getElementById('assign-workshop') as HTMLSelectElement).value;

    const saveButton = target;
    saveButton.disabled = true;
    showMessage('جاري حفظ التوزيع...', 'info');

    const inputs = document.querySelectorAll('#assign-modal input[type="number"]');
    const sizesData: any[] = [];
    let hasValidationError = false;
    const quantitiesToAdjust: any[] = [];
    let totalAssigned = 0;

    for (const input of inputs) {
      const inputEl = input as HTMLInputElement;
      const quantity = parseInt(inputEl.value, 10);
      const maxQuantity = parseInt(inputEl.dataset.max!, 10);
      const sizeName = inputEl.dataset.size!;

      if (isNaN(quantity) || quantity < 0) {
        showMessage('الرجاء إدخال كميات رقمية موجبة فقط.', 'error');
        hasValidationError = true;
        break;
      }
      if (quantity > 0) {
        totalAssigned += quantity;
        if (quantity > maxQuantity) {
          quantitiesToAdjust.push({
            size_name: sizeName,
            quantity: quantity,
            max: maxQuantity,
          });
        }
        sizesData.push({
          size_name: sizeName,
          quantity: quantity,
          max: maxQuantity,
        });
      }
    }

    if (totalAssigned === 0) {
      showMessage('الرجاء إدخال كمية واحدة على الأقل للتوزيع.', 'error');
      saveButton.disabled = false;
      return;
    }

    if (hasValidationError) {
      saveButton.disabled = false;
      return;
    }

    if (quantitiesToAdjust.length > 0) {
      const confirmModal = document.getElementById(
        'increase-cutting-confirm-modal',
      )!;
      const confirmBtn = document.getElementById('confirm-increase-cutting-btn')!;

      const confirmationText = quantitiesToAdjust
        .map((q) => {
          const increaseBy = q.quantity - q.max;
          return `المقاس **${q.size_name}**: الكمية المطلوبة ${q.quantity} أكبر من المتاح ${q.max}. سيتم زيادة كمية القص الأصلية بمقدار **${increaseBy}** قطعة.`;
        })
        .join('<br>');

      document.getElementById('increase-cutting-confirm-text')!.innerHTML =
        confirmationText + '<br><br>هل تريد المتابعة؟';

      const modalConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode!.replaceChild(modalConfirmBtn, confirmBtn);

      modalConfirmBtn.addEventListener(
        'click',
        async () => {
          closeModal('increase-cutting-confirm-modal');
          await increaseCuttingAndAssign(
            cuttingId,
            workshopId,
            sizesData,
            saveButton,
          );
        },
        {once: true},
      );

      const cancelBtn = confirmModal.querySelector(
        'button[onclick*="closeModal"]',
      )!;
      const newCancelBtn = cancelBtn.cloneNode(true) as HTMLButtonElement;
      cancelBtn.parentNode!.replaceChild(newCancelBtn, cancelBtn);

      newCancelBtn.addEventListener(
        'click',
        () => {
          closeModal('increase-cutting-confirm-modal');
          saveButton.disabled = false;
        },
        {once: true},
      );

      confirmModal.classList.add('active');
      return;
    }

    const finalAssignedSizes = sizesData
      .map((s) => ({
        size_name: s.size_name,
        quantity: s.quantity,
        delivered: 0,
        delivery_history: [],
      }))
      .filter((s) => s.quantity > 0);

    await saveAssignment(cuttingId, workshopId, finalAssignedSizes, saveButton);
  });
}

/**
 * عرض السجل الكامل للقص المكتمل والمباع (في Modal)
 */
function openCompletedCuttingHistoryModal() {
  const modal = document.getElementById('completed-cutting-history-modal')!;
  const completedAndSoldCutts = allCuttings
    .filter((c) => c.status === 'Completed' || c.status === 'Sold')
    .sort(
      (a, b) =>
        (b.finished_at || b.created_at).toMillis() -
        (a.finished_at || a.created_at).toMillis(),
    );

  const historyHtml = completedAndSoldCutts
    .map((data) => {
      const sizesHtml = (data.sizes || [])
        .map(
          (s: any) =>
            `<p class="text-sm font-medium"><strong>${s.size_name}:</strong> ${s.quantity} قطعة</p>`,
        )
        .join('');
      const finishedDate = data.finished_at
        ? data.finished_at.toDate().toLocaleString('ar-EG')
        : 'غير محدد';
      const statusText =
        data.status === 'Sold' ? 'تم البيع ✅' : 'مكتملة (متاحة للبيع) 📦';
      const statusBg = data.status === 'Sold' ? 'bg-green-600' : 'bg-yellow-600';
      const buttonHtml =
        data.status === 'Completed'
          ? `<button class="mt-4 p-2 w-full ${statusBg} text-white font-bold rounded-lg hover:bg-green-700 mark-sold-btn-modal shadow-md" data-id="${data.id}"><i class="fas fa-check-circle ml-2"></i> تم البيع</button>`
          : `<p class="mt-4 p-2 w-full text-center ${statusBg} text-white font-bold rounded-lg shadow-md">تم بيع القصة</p>`;

      return `
                    <div class="p-4 border-2 border-gray-300 rounded-xl shadow-lg flex flex-col ${data.status === 'Sold' ? 'bg-green-50' : 'bg-gray-100'}">
                        <p class="font-bold text-lg text-gray-800">الموديل: ${data.model_name || 'غير محدد'}</p>
                        <p class="text-sm text-gray-600">الإجمالي: ${data.total_pieces}</p>
                        <p class="text-sm font-bold text-white p-1 rounded-md text-center ${statusBg} inline-block">${statusText}</p>
                        <p class="text-xs text-gray-500 mt-1"><strong>تاريخ الإجراء:</strong> ${finishedDate}</p>
                        <div class="mt-3 p-2 bg-white rounded-lg flex-grow border border-gray-200">
                            <p class="font-bold mb-2 text-gray-700">المقاسات الأصلية:</p>
                            ${sizesHtml}
                        </div>
                        ${buttonHtml}
                    </div>
                `;
    })
    .join('');

  modal.innerHTML = `
                <div class="modal-content-wrapper container-card border-t-4 border-gray-600">
                    <div class="modal-header flex justify-between items-center border-b pb-3 mb-4">
                        <h3 class="text-2xl font-bold text-gray-800">السجل الكامل للقص المكتمل (${completedAndSoldCutts.length} قصة)</h3>
                        <button onclick="closeModal('completed-cutting-history-modal')" class="text-red-500 hover:text-red-700 p-2 rounded-full bg-gray-100 w-10 h-10 flex items-center justify-center">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="full-history-list">
                        ${historyHtml || '<p class="text-center text-gray-500 col-span-full p-4">لا يوجد سجل قص مكتمل أو مباع.</p>'}
                    </div>
                    <div class="modal-footer flex justify-end gap-4 mt-6 border-t pt-4">
                        <button onclick="closeModal('completed-cutting-history-modal')" class="p-3 bg-gray-400 text-white rounded-lg hover:bg-gray-500 font-bold">إغلاق</button>
                    </div>
                </div>
            `;
  modal.classList.add('active');

  // Re-attach listener for mark-sold buttons inside the modal
  document
    .querySelectorAll('.mark-sold-btn-modal')
    .forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        const cuttingId = (e.target as HTMLElement).dataset.id!;
        await markAsSold(cuttingId);
        // Re-render modal content after successful update
        openCompletedCuttingHistoryModal();
      }),
    );
}

// ====================================================================
// 6. إدارة الورش وتكاليف التصنيع (WORKSHOP & PRICE LOGIC)
// ====================================================================

/**
 * حذف ورشة (يتم التحقق من عدم وجود توزيعات أو معاملات نشطة لها أولاً)
 */
async function deleteWorkshop(workshopId: string) {
  if (!userId) return showMessage('الرجاء تسجيل الدخول أولاً.', 'error');

  try {
    const assignmentsQuery = query(
      collection(db, `users/${userId}/assignments`),
      where('workshopId', '==', workshopId),
    );
    const transactionsQuery = query(
      collection(db, `users/${userId}/transactions`),
      where('workshopId', '==', workshopId),
    );

    const [assignmentsSnapshot, transactionsSnapshot] = await Promise.all([
      getDocs(assignmentsQuery),
      getDocs(transactionsQuery),
    ]);

    if (!assignmentsSnapshot.empty || !transactionsSnapshot.empty) {
      showCustomMessage(
        'لا يمكن حذف هذه الورشة. يوجد لديها عمليات توزيع أو دفعات مسجلة.',
      );
      return;
    }

    // If no dependencies, proceed with deletion (including sub-collection 'prices')
    await runTransaction(db, async (transaction) => {
      const pricesRef = collection(
        db,
        `users/${userId}/workshops/${workshopId}/prices`,
      );
      const pricesSnapshot = await getDocs(pricesRef);
      pricesSnapshot.forEach((priceDoc) => {
        transaction.delete(priceDoc.ref);
      });

      const workshopRef = doc(db, `users/${userId}/workshops`, workshopId);
      transaction.delete(workshopRef);
    });

    showMessage('تم حذف الورشة بنجاح!', 'success');
  } catch (err: any) {
    console.error('Error deleting workshop:', err);
    showMessage(`فشل حذف الورشة: ${err.message}`, 'error');
  }
}

/**
 * عرض صفحة الورش (بما في ذلك نموذج الإضافة)
 */
function renderWorkshopsPage() {
  const page = document.getElementById('workshops-page')!;
  page.innerHTML = `
                <h2 class="text-3xl font-extrabold text-center mb-6 text-gray-900">صفحة إدارة الورش وتكاليف التصنيع</h2>
                <div class="p-6 bg-blue-50 rounded-xl mb-6 shadow-xl border-t-4 border-blue-600">
                    <h3 class="text-2xl font-semibold mb-4 text-blue-800">إضافة ورشة جديدة</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <input type="text" id="workshop-name" placeholder="اسم الورشة" class="p-3 block w-full rounded-lg shadow-sm border-2 border-blue-300">
                        <input type="text" id="workshop-contact" placeholder="معلومات الاتصال" class="p-3 block w-full rounded-lg shadow-sm border-2 border-blue-300">
                        <button id="add-workshop-btn" class="w-full p-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-md"><i class="fas fa-plus-circle ml-2"></i> إضافة ورشة</button>
                    </div>
                    <div class="mt-4">
                        <textarea id="workshop-description" rows="3" placeholder="وصف الورشة أو ملاحظات" class="p-3 mt-1 block w-full rounded-lg shadow-sm border-2 border-blue-300"></textarea>
                    </div>
                </div>
                <div class="mt-8 p-6 bg-white rounded-xl shadow-xl border-t-4 border-gray-400">
                    <h3 class="text-2xl font-extrabold mb-4 text-gray-800">قائمة الورش الحالية</h3>
                    <div id="workshops-list-container" class="space-y-4"></div>
                </div>`;
  // Fix: Cast elements to their specific types
  const nameInput = document.getElementById('workshop-name') as HTMLInputElement;
  const contactInput = document.getElementById('workshop-contact') as HTMLInputElement;
  const descTextarea = document.getElementById('workshop-description') as HTMLTextAreaElement;
  const addWorkshopBtn = document.getElementById('add-workshop-btn')!;

  // --- Double Submission Fix: Cloning for add workshop button ---
  const newAddWorkshopBtn = addWorkshopBtn.cloneNode(true) as HTMLButtonElement;
  addWorkshopBtn.parentNode!.replaceChild(newAddWorkshopBtn, addWorkshopBtn);

  // --- Permission Check for Add Workshop ---
  if (!userPermissions.workshops) {
    newAddWorkshopBtn.disabled = true;
    newAddWorkshopBtn.title = 'ليس لديك صلاحية لإضافة ورش عمل.';
    newAddWorkshopBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showPermissionDeniedMessage('workshops');
    });
  } else {
    newAddWorkshopBtn.addEventListener('click', async () => {
      if (!nameInput.value.trim())
        return showMessage('الرجاء إدخال اسم الورشة.', 'error');
      try {
        const newWorkshopRef = await addDoc(
          collection(db, `users/${userId!}/workshops`),
          {
            name: nameInput.value.trim(),
            contact: contactInput.value.trim(),
            description: descTextarea.value.trim() || '',
          },
        );

        // Add default prices for all unique model-sizes
        const cuttingModelSizes = allCuttings.flatMap((c) =>
          c.sizes.map((s: any) => ({
            model_name: c.model_name,
            size_name: s.size_name,
          })),
        );

        const uniquePrices = new Map();
        cuttingModelSizes.forEach((item) => {
          const key = `${item.model_name}-${item.size_name}`;
          if (!uniquePrices.has(key)) {
            uniquePrices.set(key, item);
          }
        });

        if (uniquePrices.size > 0) {
          const batch = writeBatch(db);
          const pricesRef = collection(
            db,
            `users/${userId!}/workshops/${newWorkshopRef.id}/prices`,
          );
          uniquePrices.forEach((item) => {
            const priceDocId = `${item.model_name}-${item.size_name}`;
            batch.set(doc(pricesRef, priceDocId), {
              model_name: item.model_name,
              size_name: item.size_name,
              price: 0,
            });
          });
          await batch.commit();
        }

        showMessage(
          'تمت إضافة الورشة بنجاح! يمكن تحديد الأسعار الآن.',
          'success',
        );
        nameInput.value = '';
        contactInput.value = '';
        descTextarea.value = '';
      } catch (err: any) {
        showMessage(`فشل الإضافة: ${err.message}`, 'error');
      }
    });
  }
}

/**
 * عرض قائمة الورش مع الأرصدة
 */
function renderWorkshops() {
  const container = document.getElementById('workshops-list-container');
  if (!container) return;
  container.innerHTML = allWorkshops
    .map((workshop) => {
      const {balance} = calculateWorkshopBalance(workshop.id);
      const statusColor = balance > 0 ? 'text-red-600' : 'text-green-600';
      const statusBg = balance > 0 ? 'bg-red-50' : 'bg-green-50';

      // Add permission checks to buttons in the list item
      const canEditPrices = userPermissions.workshops
        ? ''
        : 'disabled title="صلاحيات الورش غير متاحة."';
      const canViewDelivery = userPermissions.delivery
        ? ''
        : 'disabled title="صلاحيات الاستلام غير متاحة."';
      const canDelete = userPermissions.workshops
        ? ''
        : 'disabled title="صلاحيات الورش غير متاحة."';

      return `
                <div class="p-4 border-2 border-gray-200 rounded-xl flex flex-col md:flex-row justify-between items-center shadow-lg ${statusBg}">
                    <div class="w-full md:w-1/2 space-y-1 mb-4 md:mb-0">
                        <p class="font-extrabold text-xl text-gray-800">${workshop.name}</p>
                        <p class="text-sm text-gray-600">${workshop.contact}</p>
                        <p class="text-base font-bold text-gray-800">الرصيد: <span class="${statusColor} text-lg">${balance.toFixed(2)}</span></p>
                    </div>
                    <div class="flex flex-wrap gap-2 mt-4 md:mt-0 w-full md:w-1/2 justify-end">
                        <button class="p-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 set-prices-btn shadow-md" data-id="${workshop.id}" ${canEditPrices}><i class="fas fa-tags ml-2"></i> تعديل الأسعار</button>
                        <button class="p-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 open-delivery-page-btn shadow-md" data-workshop-id="${workshop.id}" ${canViewDelivery}><i class="fas fa-boxes-stack"></i> متابعة القطع</button>
                        <button class="p-2 bg-yellow-600 text-white font-bold rounded-lg hover:bg-yellow-700 view-delivery-history-btn shadow-md" data-id="${workshop.id}"><i class="fas fa-history ml-2"></i> سجل التسليمات</button>
                        <button class="p-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 delete-workshop-btn shadow-md" data-id="${workshop.id}" ${canDelete}><i class="fas fa-trash-alt ml-2"></i> حذف ورشة</button>
                    </div>
                </div>`;
    })
    .join('');

  // --- Double Submission Fix: Cloning and Re-attaching listeners ---
  document.querySelectorAll('.set-prices-btn').forEach((btn) => {
    const newBtn = btn.cloneNode(true) as HTMLButtonElement;
    btn.parentNode!.replaceChild(newBtn, btn);
    if (newBtn.disabled) {
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showPermissionDeniedMessage('workshops');
      });
    } else {
      newBtn.addEventListener('click', (e) => {
        const workshopId = (e.target as HTMLElement).dataset.id!;
        openPriceModal(workshopId);
      });
    }
  });

  document.querySelectorAll('.open-delivery-page-btn').forEach((btn) => {
    const newBtn = btn.cloneNode(true) as HTMLButtonElement;
    btn.parentNode!.replaceChild(newBtn, btn);
    if (newBtn.disabled) {
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showPermissionDeniedMessage('delivery');
      });
    } else {
      newBtn.addEventListener('click', (e) => {
        const workshopId = (e.target as HTMLElement).dataset.workshopId!;
        renderDeliveryPage(workshopId);
        document.getElementById('delivery-page')!.classList.add('active');
        document.getElementById('workshops-page')!.classList.remove('active');
        document
          .querySelectorAll('.page')
          .forEach((page) => page.classList.remove('active'));
        document.getElementById('delivery-page')!.classList.add('active');
        document
          .querySelectorAll('.nav-button')
          .forEach((b) => b.classList.remove('active'));
        document
          .querySelector('.nav-button[data-page="delivery"]')!
          .classList.add('active');
      });
    }
  });

  document.querySelectorAll('.view-delivery-history-btn').forEach((btn) => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode!.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', (e) => {
      const workshopId = (e.target as HTMLElement).dataset.id!;
      openDeliveryHistoryModal(workshopId);
    });
  });

  document.querySelectorAll('.delete-workshop-btn').forEach((btn) => {
    const newBtn = btn.cloneNode(true) as HTMLButtonElement;
    btn.parentNode!.replaceChild(newBtn, btn);
    if (newBtn.disabled) {
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showPermissionDeniedMessage('workshops');
      });
    } else {
      newBtn.addEventListener('click', async (e) => {
        const workshopId = (e.target as HTMLElement).dataset.id!;
        await deleteWorkshop(workshopId);
      });
    }
  });
}

/**
 * عرض النافذة المنبثقة لتعديل أسعار الورشة
 */
async function openPriceModal(workshopId: string) {
  const modal = document.getElementById('price-modal')!;
  const workshop = allWorkshops.find((w) => w.id === workshopId);

  const modelSizePairs = allCuttings.flatMap((c) =>
    c.sizes.map((s: any) => ({
      model_name: c.model_name,
      size_name: s.size_name,
    })),
  );

  const uniquePairs = [
    ...new Map(
      modelSizePairs.map((item) => [`${item.model_name}-${item.size_name}`, item]),
    ).values(),
  ];
  const prices = workshopPrices[workshopId] || [];

  const priceInputs = uniquePairs
    .map((pair) => {
      const priceDocId = `${pair.model_name}-${pair.size_name}`;
      const currentPrice =
        prices.find((p) => p.id === priceDocId)?.price || 0;
      return `
                    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-3 bg-gray-50 rounded-lg shadow-sm border-r-4 border-blue-200">
                        <label class="w-full sm:w-1/2 font-medium text-gray-700 whitespace-nowrap">${pair.model_name} - ${pair.size_name}</label>
                        <div class="w-full sm:w-1/2 flex items-center gap-2">
                            <input type="number" step="0.01" value="${currentPrice}" data-model="${pair.model_name}" data-size="${pair.size_name}" class="p-2 w-full border border-gray-300 rounded-lg text-center font-mono text-lg">
                            <span class="text-gray-500">ج.م</span>
                        </div>
                    </div>`;
    })
    .join('');

  // Apply fixed structure to enable scrolling for content
  modal.innerHTML = `
                <div class="modal-content-wrapper container-card border-t-4 border-blue-600">
                    <div class="modal-header flex justify-between items-center border-b pb-3 mb-4">
                        <h3 class="text-2xl font-bold text-gray-800">تحديد أسعار لورشة ${workshop.name}</h3>
                        <button onclick="closeModal('price-modal')" class="text-red-500 hover:text-red-700 p-2 rounded-full bg-gray-100 w-10 h-10 flex items-center justify-center">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    
                    <p class="mb-4 text-sm text-gray-600 modal-header">يرجى إدخال سعر قطعة التصنيع لكل موديل ومقاس (القيمة الحالية بالجنيه المصري).</p>
                    
                    <div class="modal-body space-y-4 p-2 border border-gray-200 rounded-xl">
                        ${priceInputs || '<p class="text-center text-gray-500 p-4">لا توجد موديلات أو مقاسات مسجلة لتحديد سعرها.</p>'}
                    </div>
                    <div class="modal-footer flex justify-end gap-4 mt-6 border-t pt-4">
                        <button id="save-prices-btn" data-workshop-id="${workshopId}" class="p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold shadow-md"><i class="fas fa-save ml-2"></i> حفظ الأسعار</button>
                        <button onclick="closeModal('price-modal')" class="p-3 bg-gray-400 text-white rounded-lg hover:bg-gray-500 font-bold">إلغاء</button>
                    </div>
                </div>`;
  modal.classList.add('active');

  // --- Double Submission Fix: Cloning for save prices button ---
  const savePricesBtn = document.getElementById('save-prices-btn')!;
  const newSavePricesBtn = savePricesBtn.cloneNode(true);
  savePricesBtn.parentNode!.replaceChild(newSavePricesBtn, savePricesBtn);

  newSavePricesBtn.addEventListener('click', async (e) => {
    const workshopId = (e.target as HTMLElement).dataset.workshopId!;
    const batch = writeBatch(db);
    const pricesRef = collection(
      db,
      `users/${userId!}/workshops/${workshopId}/prices`,
    );

    document.querySelectorAll('#price-modal input').forEach((input) => {
      const inputEl = input as HTMLInputElement;
      const model = inputEl.dataset.model!;
      const size = inputEl.dataset.size!;
      const price = parseFloat(inputEl.value) || 0;
      const priceDocId = `${model}-${size}`;
      if (price >= 0) {
        const priceDocRef = doc(pricesRef, priceDocId);
        batch.set(priceDocRef, {model_name: model, size_name: size, price});
      }
    });

    try {
      await batch.commit();
      showMessage('تم حفظ الأسعار بنجاح!', 'success');
      closeModal('price-modal');
    } catch (err: any) {
      console.error('Error saving prices:', err);
      showMessage(`فشل حفظ الأسعار: ${err.message}`, 'error');
    }
  });
}

// ====================================================================
// 7. إدارة الاستلام والإرجاع (DELIVERY & REVERT LOGIC)
// ====================================================================

/**
 * تحديث عملية استلام القطع من الورشة
 */
async function updateDelivery(assignmentId: string, sizeName: string, quantityToAdd: number) {
  if (!userId) return showMessage('الرجاء تسجيل الدخول أولاً.', 'error');

  try {
    // Fetch the price before the transaction to ensure it's up-to-date
    const assignment = allAssignments.find((a) => a.id === assignmentId);
    const cutting = allCuttings.find((c) => c.id === assignment.cuttingId);
    const priceDocId = `${cutting.model_name}-${sizeName}`;
    const pricePerPiece =
      workshopPrices[assignment.workshopId]?.find((p) => p.id === priceDocId)
        ?.price || 0;

    await runTransaction(db, async (transaction) => {
      const assignmentRef = doc(db, `users/${userId!}/assignments`, assignmentId);
      const cuttingRef = doc(db, `users/${userId!}/cutting`, assignment.cuttingId);
      const assignmentDoc = await transaction.get(assignmentRef);
      const cuttingDoc = await transaction.get(cuttingRef);

      if (!assignmentDoc.exists()) throw new Error('سجل التوزيع غير موجود.');
      if (!cuttingDoc.exists()) throw new Error('سجل القص غير موجود.');

      const currentAssignments = assignmentDoc.data().assigned_sizes;
      const updatedAssignments = currentAssignments.map((s: any) => {
        if (s.size_name === sizeName) {
          const newDelivered = s.delivered + quantityToAdd;
          const newHistory = [
            ...(s.delivery_history || []),
            {
              delivered_quantity: quantityToAdd,
              updated_at: new Date(),
              price_per_piece: pricePerPiece,
              cutting_id: cutting.id, // Save cutting ID with delivery history
            },
          ];
          return {...s, delivered: newDelivered, delivery_history: newHistory};
        }
        return s;
      });

      let allDelivered = true;
      updatedAssignments.forEach((s: any) => {
        if (s.delivered < s.quantity) allDelivered = false;
      });

      transaction.update(assignmentRef, {
        assigned_sizes: updatedAssignments,
        status: allDelivered ? 'Delivered' : 'In Progress',
      });

      // Update cutting received pieces
      transaction.update(cuttingRef, {
        received_pieces: increment(quantityToAdd),
      });
    });
  } catch (err) {
    console.error('Error updating delivery:', err);
    throw err;
  }
}

/**
 * استلام جميع القطع المتبقية من ورشة معينة
 */
async function receiveAllFromWorkshop(workshopId: string) {
  if (!userPermissions.delivery) {
    showPermissionDeniedMessage('delivery');
    return;
  }
  const workshopAssignments = allAssignments.filter(
    (a) =>
      a.workshopId === workshopId &&
      a.assigned_sizes.some((s: any) => s.delivered < s.quantity),
  );
  const batch = writeBatch(db);

  for (const assignment of workshopAssignments) {
    const updatedAssignedSizes = [];
    let totalReceivedInAssignment = 0;

    const cutting = allCuttings.find((c) => c.id === assignment.cuttingId);

    for (const size of assignment.assigned_sizes) {
      const remaining = size.quantity - size.delivered;
      if (remaining > 0) {
        const priceDocId = `${cutting?.model_name || 'N/A'}-${size.size_name}`;
        const pricePerPiece =
          workshopPrices[workshopId]?.find((p) => p.id === priceDocId)?.price ||
          0;

        const newDelivered = size.delivered + remaining;
        const newHistory = [
          ...(size.delivery_history || []),
          {
            delivered_quantity: remaining,
            updated_at: new Date(),
            price_per_piece: pricePerPiece,
            cutting_id: assignment.cuttingId,
          },
        ];
        updatedAssignedSizes.push({
          ...size,
          delivered: newDelivered,
          delivery_history: newHistory,
        });
        totalReceivedInAssignment += remaining;
      } else {
        updatedAssignedSizes.push(size);
      }
    }

    if (totalReceivedInAssignment > 0) {
      const assignmentRef = doc(db, `users/${userId!}/assignments`, assignment.id);
      batch.update(assignmentRef, {
        assigned_sizes: updatedAssignedSizes,
        status: 'Delivered',
      });

      const cuttingRef = doc(db, `users/${userId!}/cutting`, assignment.cuttingId);
      batch.update(cuttingRef, {
        received_pieces: increment(totalReceivedInAssignment),
      });
    }
  }
  await batch.commit();
}

/**
 * إرجاع القطع من الورشة إلى القص
 */
async function revertPieces(assignmentId: string, sizeName: string, quantity: number, cuttingId: string) {
  if (!userId) {
    showCustomMessage('الرجاء تسجيل الدخول أولاً.');
    return;
  }

  try {
    await runTransaction(db, async (transaction) => {
      const assignmentRef = doc(db, `users/${userId!}/assignments`, assignmentId);
      const cuttingRef = doc(db, `users/${userId!}/cutting`, cuttingId);

      const [assignmentDoc, cuttingDoc] = await Promise.all([
        transaction.get(assignmentRef),
        transaction.get(cuttingRef),
      ]);

      let cuttingData = cuttingDoc.data();

      // Handle case where cutting document was deleted (re-create it for reconciliation)
      if (!cuttingDoc.exists()) {
        const assignmentData = assignmentDoc.data()!;
        const modelName =
          allCuttings.find((c) => c.id === assignmentData.cuttingId)
            ?.model_name || 'تم حذف القصة الأصلية';

        cuttingData = {
          model_name: modelName,
          total_layers: 0,
          total_pieces: 0,
          remaining_pieces: 0,
          received_pieces: 0,
          created_at: new Date(),
          finished_at: null,
          status: 'In Progress',
          sizes: assignmentData.assigned_sizes.map((s: any) => ({
            size_name: s.size_name,
            quantity: 0,
          })),
        };
        transaction.set(cuttingRef, cuttingData);
      }

      const currentAssignedSizes = assignmentDoc.data()!.assigned_sizes;
      const currentCuttingSizes = cuttingData.sizes;
      const currentRemainingPieces = cuttingData.remaining_pieces;

      // --- Assignment Update ---
      const newAssignedSizes = currentAssignedSizes
        .map((s: any) => {
          if (s.size_name === sizeName) {
            const newQuantity = Math.max(0, s.quantity - quantity);
            return {...s, quantity: newQuantity};
          }
          return s;
        })
        .filter((s: any) => s.quantity > 0);

      const newTotalQuantity = newAssignedSizes.reduce(
        (sum: number, s: any) => sum + s.quantity,
        0,
      );

      // --- Cutting Update ---
      const newCuttingSizes = currentCuttingSizes.map((s: any) => {
        if (s.size_name === sizeName) {
          return {...s, quantity: s.quantity + quantity};
        }
        return s;
      });

      const newRemainingPieces = currentRemainingPieces + quantity;

      if (newTotalQuantity === 0) {
        transaction.delete(assignmentRef);
      } else {
        transaction.update(assignmentRef, {
          assigned_sizes: newAssignedSizes,
          total_quantity: newTotalQuantity,
        });
      }

      const newCuttingStatus =
        newRemainingPieces === 0 ? 'Completed' : 'In Progress';
      transaction.update(cuttingRef, {
        sizes: newCuttingSizes,
        remaining_pieces: newRemainingPieces,
        status: newCuttingStatus,
      });
    });

    showMessage('تم إرجاع القطع بنجاح!', 'success');
  } catch (err: any) {
    console.error('Revert error:', err);
    showMessage(`فشل إرجاع القطع: ${err.message}`, 'error');
  }
}

/**
 * عرض صفحة الاستلام (فلترة اختيارية حسب الورشة)
 */
function renderDeliveryPage(filterWorkshopId: string | null = null) {
  const page = document.getElementById('delivery-page');
  if (!page) return;

  const cuttingMap = new Map(allCuttings.map((c) => [c.id, c]));
  const workshopMap = new Map(allWorkshops.map((w) => [w.id, w]));

  let pendingAssignments = allAssignments.filter((a) =>
    a.assigned_sizes.some((s: any) => s.delivered < s.quantity),
  );

  if (filterWorkshopId) {
    pendingAssignments = pendingAssignments.filter(
      (a) => a.workshopId === filterWorkshopId,
    );
  }

  // Fix: Type the accumulator for reduce
  const groupedByWorkshop = pendingAssignments.reduce<{ [key: string]: { id: string; assignments: any[] } }>((acc, curr) => {
    const workshopName = workshopMap.get(curr.workshopId)?.name || 'غير معروفة';
    if (!acc[workshopName]) {
      acc[workshopName] = {id: curr.workshopId, assignments: []};
    }
    acc[workshopName].assignments.push(curr);
    return acc;
  }, {});

  const workshopsHtml = Object.entries(groupedByWorkshop)
    .map(([workshopName, data]) => {
      const assignmentsHtml = data.assignments
        .map((a) => {
          const modelName = cuttingMap.get(a.cuttingId)?.model_name || 'غير محدد';
          const sizesHtml = a.assigned_sizes
            .map((s: any) => {
              const remaining = s.quantity - s.delivered;
              if (remaining <= 0) return '';
              return `
                            <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-3 bg-white rounded-lg shadow-sm border-r-4 border-blue-200">
                                <label class="w-full sm:w-1/3 font-medium text-gray-700 whitespace-nowrap">المقاس ${s.size_name} (<span class="text-red-600 font-bold">${remaining}</span> متبقي):</label>
                                <div class="flex items-center w-full sm:w-2/3 gap-2">
                                    <input type="number" class="p-2 w-full border border-gray-300 rounded-lg receive-quantity-input text-center" 
                                        data-assignment-id="${a.id}" data-size-name="${s.size_name}" value="${remaining}" min="1" max="${remaining}">
                                    <button class="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 receive-pieces-btn whitespace-nowrap shadow-sm"
                                        data-assignment-id="${a.id}" data-size-name="${s.size_name}">
                                        <i class="fas fa-truck-ramp-box"></i> استلام
                                    </button>
                                    <button class="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 revert-pieces-btn whitespace-nowrap shadow-sm" data-assignment-id="${a.id}" data-size-name="${s.size_name}" data-quantity="${remaining}" data-cutting-id="${a.cuttingId}">
                                        <i class="fas fa-rotate-left"></i> ارجاع
                                    </button>
                                </div>
                            </div>
                        `;
            })
            .join('');

          return `
                        <div class="p-4 bg-gray-50 rounded-xl shadow-md border border-gray-200">
                            <h4 class="font-bold text-xl mb-2 text-gray-800 border-b pb-1">الموديل: ${modelName}</h4>
                            <p class="text-sm text-gray-600 mb-4">تم التوزيع: ${a.total_quantity} | تم الاستلام: ${a.assigned_sizes.reduce((sum: number, s: any) => sum + s.delivered, 0)}</p>
                            <div class="space-y-3">
                                ${sizesHtml}
                            </div>
                        </div>
                    `;
        })
        .join('');

      return `
                    <div class="p-6 bg-white rounded-xl mb-6 shadow-xl border-t-4 border-purple-600">
                        <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 border-b pb-3">
                            <h3 class="text-2xl font-extrabold text-purple-800">${workshopName}</h3>
                            <button class="p-3 mt-4 md:mt-0 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 receive-all-workshop-btn shadow-md" data-workshop-id="${data.id}">
                                <i class="fas fa-boxes-packing ml-2"></i> استلام الكل من هذه الورشة
                            </button>
                        </div>
                        <div class="space-y-4">
                            ${assignmentsHtml}
                        </div>
                    </div>
                `;
    })
    .join('');

  const totalPendingCount = pendingAssignments.reduce(
    (sum, a) =>
      sum +
      a.total_quantity -
      a.assigned_sizes.reduce((s: number, c: any) => s + c.delivered, 0),
    0,
  );

  page.innerHTML = `
                <h2 class="text-3xl font-extrabold text-center mb-6 text-gray-900">صفحة استلام القطع الجاهزة</h2>
                <div class="p-6 bg-blue-100 rounded-xl mb-6 text-center shadow-xl border-b-4 border-blue-600">
                    <p class="text-2xl font-extrabold text-blue-800">إجمالي القطع المتبقية للاستلام: ${totalPendingCount}</p>
                    <button id="receive-all-pending-btn" class="mt-4 p-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-400 shadow-md">
                        <i class="fas fa-box-open ml-2"></i> استلام جميع القطع المتبقية من الورش
                    </button>
                </div>
                <div id="delivery-list" class="space-y-6">
                    ${workshopsHtml || '<p class="text-center text-gray-500 text-xl p-8 bg-white rounded-xl shadow-md">لا توجد قطع متبقية للاستلام في أي ورشة حالياً. </p>'}
                </div>
            `;

  // --- Double Submission Fix: Cloning for receive-all-pending-btn ---
  const receiveAllBtn = document.getElementById('receive-all-pending-btn');
  if (receiveAllBtn) {
    const newReceiveAllBtn = receiveAllBtn.cloneNode(true) as HTMLButtonElement;
    receiveAllBtn.parentNode!.replaceChild(newReceiveAllBtn, receiveAllBtn);

    // --- Permission Check for Receive All ---
    if (!userPermissions.delivery) {
      newReceiveAllBtn.disabled = true;
      newReceiveAllBtn.title = 'ليس لديك صلاحية لتسجيل عمليات الاستلام.';
      newReceiveAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showPermissionDeniedMessage('delivery');
      });
    } else {
      newReceiveAllBtn.addEventListener('click', async () => {
        const btn = newReceiveAllBtn;
        btn.disabled = true;
        showMessage('جاري استلام جميع القطع...', 'info');
        const uniqueWorkshopIds = [
          ...new Set(pendingAssignments.map((a) => a.workshopId)),
        ];
        for (const workshopId of uniqueWorkshopIds) {
          await receiveAllFromWorkshop(workshopId);
        }
        showMessage('تم استلام جميع القطع بنجاح!', 'success');
        btn.disabled = false;
      });
    }
  }

  // --- Double Submission Fix: Cloning and Permission Check for list buttons ---
  document.querySelectorAll('.receive-all-workshop-btn').forEach((btn) => {
    const newBtn = btn.cloneNode(true) as HTMLButtonElement;
    btn.parentNode!.replaceChild(newBtn, btn);
    if (!userPermissions.delivery) {
      newBtn.disabled = true;
      newBtn.title = 'صلاحيات الاستلام غير متاحة.';
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showPermissionDeniedMessage('delivery');
      });
    } else {
      newBtn.addEventListener('click', async (e) => {
        const target = e.target as HTMLButtonElement;
        const workshopId = target.dataset.workshopId!;
        target.disabled = true;
        showMessage('جاري استلام القطع من الورشة...', 'info');
        await receiveAllFromWorkshop(workshopId);
        showMessage('تم استلام جميع القطع من الورشة بنجاح!', 'success');
        target.disabled = false;
      });
    }
  });

  document.querySelectorAll('.receive-pieces-btn').forEach((btn) => {
    const newBtn = btn.cloneNode(true) as HTMLButtonElement;
    btn.parentNode!.replaceChild(newBtn, btn);
    if (!userPermissions.delivery) {
      newBtn.disabled = true;
      newBtn.title = 'صلاحيات الاستلام غير متاحة.';
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showPermissionDeniedMessage('delivery');
      });
    } else {
      newBtn.addEventListener('click', async (e) => {
        const target = e.target as HTMLButtonElement;
        const {assignmentId, sizeName} = target.dataset;
        const input = page.querySelector(
          `input[data-assignment-id="${assignmentId}"][data-size-name="${sizeName}"]`,
        ) as HTMLInputElement;
        const quantity = parseInt(input.value, 10);
        if (
          isNaN(quantity) ||
          quantity <= 0 ||
          quantity > parseInt(input.max, 10)
        ) {
          return showMessage(
            'الرجاء إدخال كمية صحيحة وموجبة لا تتجاوز المتبقي.',
            'error',
          );
        }
        target.disabled = true;
        await updateDelivery(assignmentId!, sizeName!, quantity);
        showMessage('تم استلام القطع بنجاح!', 'success');
        target.disabled = false;
      });
    }
  });

  document.querySelectorAll('.revert-pieces-btn').forEach((btn) => {
    const newBtn = btn.cloneNode(true) as HTMLButtonElement;
    btn.parentNode!.replaceChild(newBtn, btn);
    if (!userPermissions.delivery) {
      newBtn.disabled = true;
      newBtn.title = 'صلاحيات الإرجاع غير متاحة.';
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showPermissionDeniedMessage('delivery');
      });
    } else {
      newBtn.addEventListener('click', (e) => {
        const {assignmentId, sizeName, quantity, cuttingId} = (e.target as HTMLElement).dataset;
        showRevertModal(assignmentId!, sizeName!, parseInt(quantity!), cuttingId!);
      });
    }
  });
}

/**
 * عرض نافذة تأكيد الإرجاع
 */
function showRevertModal(assignmentId: string, sizeName: string, quantity: number, cuttingId: string) {
  const modal = document.getElementById('revert-modal-confirm')!;
  const revertBtn = document.getElementById('confirm-revert-btn')!;

  document.getElementById(
    'revert-confirm-text',
  )!.textContent = `هل أنت متأكد من إرجاع ${quantity} قطعة من مقاس ${sizeName}؟`;

  // --- Double Submission Fix: Cloning for confirm revert button ---
  const newRevertBtn = revertBtn.cloneNode(true) as HTMLButtonElement;
  revertBtn.parentNode!.replaceChild(newRevertBtn, revertBtn);

  newRevertBtn.addEventListener(
    'click',
    async () => {
      newRevertBtn.disabled = true;
      try {
        await revertPieces(assignmentId, sizeName, quantity, cuttingId);
        closeModal('revert-modal-confirm');
      } catch (err) {
        newRevertBtn.disabled = false;
      }
    },
    {once: true},
  );

  modal.classList.add('active');
}

/**
 * عرض سجل التسليمات لورشة معينة
 */
function openDeliveryHistoryModal(workshopId: string) {
  const modal = document.getElementById('delivery-history-modal')!;
  const workshop = allWorkshops.find((w) => w.id === workshopId);
  const deliveries: any[] = [];
  allAssignments
    .filter((a) => a.workshopId === workshopId)
    .forEach((a) => {
      a.assigned_sizes.forEach((s: any) => {
        (s.delivery_history || []).forEach((h: any) => {
          deliveries.push({
            model_name: allCuttings.find((c) => c.id === a.cuttingId)?.model_name,
            size_name: s.size_name,
            delivered_quantity: h.delivered_quantity,
            updated_at: h.updated_at,
          });
        });
      });
    });

  const deliveriesHtml = deliveries
    .sort((a, b) => b.updated_at.toMillis() - a.updated_at.toMillis())
    .map((d) => {
      return `
                    <div class="p-3 border-b last:border-b-0 bg-white rounded-lg shadow-sm flex justify-between items-center hover:bg-gray-50 transition-colors">
                        <div>
                            <p class="text-sm">الموديل: <strong>${d.model_name || 'غير محدد'}</strong></p>
                            <p class="text-sm">المقاس: <strong>${d.size_name}</strong></p>
                            <p class="text-xs text-gray-500">التاريخ: ${d.updated_at.toDate().toLocaleString('ar-EG')}</p>
                        </div>
                        <p class="text-lg font-extrabold text-blue-600">${d.delivered_quantity} قطعة</p>
                    </div>
                `;
    })
    .join('');

  // Apply fixed structure to enable scrolling for content
  modal.innerHTML = `
                <div class="modal-content-wrapper container-card border-t-4 border-blue-600">
                    <div class="modal-header flex justify-between items-center border-b pb-3 mb-4">
                        <h3 class="text-2xl font-bold">سجل التسليمات لورشة ${workshop.name}</h3>
                        <button onclick="closeModal('delivery-history-modal')" class="text-red-500 hover:text-red-700 p-2 rounded-full bg-gray-100 w-10 h-10 flex items-center justify-center">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body space-y-2 bg-gray-100 p-2 rounded-xl">
                        ${deliveriesHtml || '<p class="text-center text-gray-500">لا يوجد سجل تسليمات لهذه الورشة.</p>'}
                    </div>
                    <div class="modal-footer flex justify-end gap-4 mt-6 border-t pt-4">
                        <button onclick="closeModal('delivery-history-modal')" class="p-3 bg-gray-400 text-white rounded-lg hover:bg-gray-500 font-bold">إغلاق</button>
                    </div>
                </div>`;
  modal.classList.add('active');
}

// ====================================================================
// 8. إدارة الحسابات والمعاملات (ACCOUNTING & TRANSACTIONS)
// ====================================================================

/**
 * حذف سجل تسليم معين من التاريخ والتأثير على القطع المستلمة
 */
async function deleteDeliveryTransaction(assignmentId: string, sizeName: string, historyIndex: number) {
  if (!userId) return showMessage('الرجاء تسجيل الدخول أولاً.', 'error');

  try {
    let quantityToRemove = 0;
    let cuttingId: string | null = null;

    await runTransaction(db, async (transaction) => {
      const assignmentRef = doc(db, `users/${userId!}/assignments`, assignmentId);
      const assignmentDoc = await transaction.get(assignmentRef);
      if (!assignmentDoc.exists()) throw new Error('سجل التوزيع غير موجود.');

      const assignmentData = assignmentDoc.data();
      cuttingId = assignmentData.cuttingId;

      const currentAssignments = assignmentData.assigned_sizes;

      const updatedAssignments = currentAssignments.map((s: any) => {
        if (s.size_name === sizeName) {
          const history = s.delivery_history || [];
          if (historyIndex >= 0 && historyIndex < history.length) {
            quantityToRemove = history[historyIndex].delivered_quantity;
            const newHistory = history.filter((_: any, index: number) => index !== historyIndex);
            const newDelivered = s.delivered - quantityToRemove;
            return {...s, delivered: newDelivered, delivery_history: newHistory};
          }
        }
        return s;
      });

      if (quantityToRemove === 0)
        throw new Error('لم يتم العثور على سجل التسليم للحذف.');

      let allDelivered = true;
      updatedAssignments.forEach((s: any) => {
        if (s.delivered < s.quantity) allDelivered = false;
      });

      transaction.update(assignmentRef, {
        assigned_sizes: updatedAssignments,
        status: allDelivered ? 'Delivered' : 'In Progress',
      });

      // Revert cutting received pieces
      const cuttingRef = doc(db, `users/${userId!}/cutting`, cuttingId!);
      transaction.update(cuttingRef, {
        received_pieces: increment(-quantityToRemove),
      });
    });

    showMessage('تم حذف عملية التسليم بنجاح!', 'success');
    const assignment = allAssignments.find((a) => a.id === assignmentId);

    // Re-render relevant parts
    if (document.getElementById('delivery-page')!.classList.contains('active')) {
      renderDeliveryPage(assignment.workshopId);
    }

    if (
      document
        .getElementById('detailed-accounts-history-modal')!
        .classList.contains('active')
    ) {
      viewDetailedAccountHistoryModal(assignment.workshopId);
    }
  } catch (err: any) {
    console.error('Error deleting delivery transaction:', err);
    showMessage(`فشل حذف عملية التسليم: ${err.message}`, 'error');
  }
}

/**
 * حذف معاملة دفع/خصم يدوية
 */
async function deleteTransaction(transactionId: string) {
  if (!userId) return showMessage('الرجاء تسجيل الدخول أولاً.', 'error');
  try {
    await deleteDoc(doc(db, `users/${userId!}/transactions`, transactionId));
    showMessage('تم حذف المعاملة بنجاح!', 'success');
    // Re-render the modal if it's open
    const openModal = document.getElementById('transactions-modal')!;
    if (openModal.classList.contains('active')) {
      const workshopId = allTransactions.find((t) => t.id === transactionId)
        ?.workshopId;
      if (workshopId) openTransactionsModal(workshopId);
    }
  } catch (err: any) {
    console.error('Error deleting transaction:', err);
    showMessage(`فشل حذف المعاملة: ${err.message}`, 'error');
  }
}

/**
 * حساب رصيد الورشة (المستحق vs. المدفوع)
 */
function calculateWorkshopBalance(workshopId: string) {
  const workshopAssignments = allAssignments.filter(
    (a) => a.workshopId === workshopId,
  );
  const workshopTransactions = allTransactions.filter(
    (t) => t.workshopId === workshopId,
  );

  let totalDue = 0;
  const completedItems: any[] = [];

  // 1. Calculate Total Due from delivered pieces (The workshop's credit)
  workshopAssignments.forEach((assignment) => {
    assignment.assigned_sizes.forEach((size: any) => {
      (size.delivery_history || []).forEach((delivery: any, historyIndex: number) => {
        const cost = delivery.delivered_quantity * delivery.price_per_piece;
        totalDue += cost;
        completedItems.push({
          assignmentId: assignment.id,
          historyIndex: historyIndex,
          cutting_id: assignment.cuttingId,
          model_name: allCuttings.find((c) => c.id === assignment.cuttingId)
            ?.model_name,
          size_name: size.size_name,
          quantity: delivery.delivered_quantity,
          price: delivery.price_per_piece,
          cost: cost,
          delivery_date: delivery.updated_at,
        });
      });
    });
  });

  // 2. Calculate Total Paid (payments and deductions/deductions)
  let totalPayments = 0;
  let totalDeductions = 0;

  workshopTransactions.forEach((t) => {
    if (t.type === 'payment') {
      totalPayments += t.amount;
    } else if (t.type === 'discount') {
      totalDeductions += t.amount;
    }
  });

  const totalNetPaid = totalPayments + totalDeductions;
  const balance = totalDue - totalNetPaid;

  // 3. Determine Unsettled Items for Display (Clearing paid deliveries visually - FIFO)
  let paymentCredit = totalNetPaid;
  const owedItemsForDisplay: any[] = [];
  const completedItemsCopy = [...completedItems];

  completedItemsCopy.sort(
    (a, b) => a.delivery_date.toMillis() - b.delivery_date.toMillis(),
  );

  for (const item of completedItemsCopy) {
    if (paymentCredit >= item.cost) {
      paymentCredit -= item.cost;
    } else {
      const remainingCost = item.cost - paymentCredit;

      if (remainingCost > 0) {
        const remainingQuantity = Math.round(remainingCost / item.price);

        owedItemsForDisplay.push({
          ...item,
          quantity: remainingQuantity,
          cost: remainingCost,
        });
      }
      paymentCredit = 0;
    }
  }

  return {
    totalDue,
    totalPayments,
    totalDeductions: -totalDeductions,
    totalNetPaid,
    balance,
    completedItems,
    owedItemsForDisplay,
  };
}

/**
 * عرض صفحة الحسابات الرئيسية
 */
function renderAccounts() {
  const page = document.getElementById('accounts-page');
  if (!page) return;
  page.innerHTML = `
                <h2 class="text-3xl font-extrabold text-center mb-6 text-gray-900">صفحة الحسابات والمبالغ المستحقة للورش</h2>
                <div class="mt-6 p-6 bg-white rounded-xl shadow-xl border-t-4 border-gray-400">
                    <h3 class="text-2xl font-bold mb-4 text-gray-800">قائمة حسابات الورش</h3>
                    <div id="accounts-list-container" class="space-y-4"></div>
                </div>`;

  const container = document.getElementById('accounts-list-container')!;
  container.innerHTML = allWorkshops
    .map((workshop) => {
      const {totalDue, totalNetPaid, balance} =
        calculateWorkshopBalance(workshop.id);
      const statusColor = balance > 0 ? 'text-red-600' : 'text-green-600';
      const statusBg = balance > 0 ? 'bg-red-50' : 'bg-green-50';
      const balanceText = balance > 0 ? 'مستحق للورشة' : 'رصيد لصالح المصنع';

      // Add permission checks to buttons
      const canViewAccount = userPermissions.accounts
        ? ''
        : 'disabled title="صلاحيات الحسابات غير متاحة."';

      return `
                <div class="p-4 border-2 border-gray-200 rounded-xl flex flex-col md:flex-row justify-between items-center shadow-lg ${statusBg}">
                    <div class="w-full md:w-1/2 space-y-1 mb-4 md:mb-0">
                        <p class="font-extrabold text-xl text-gray-800">${workshop.name}</p>
                        <p>الإجمالي المستحق (القطع): <span class="font-bold text-blue-600">${totalDue.toFixed(2)}</span></p>
                        <p>إجمالي المدفوع (صافي): <span class="font-bold">${totalNetPaid.toFixed(2)}</span></p>
                        <p class="text-lg font-extrabold">الرصيد المتبقي: <span class="${statusColor} text-2xl">${Math.abs(balance).toFixed(2)}</span> <span class="text-sm ${statusColor}">(${balanceText})</span></p>
                    </div>
                    <div class="flex flex-wrap gap-2 w-full md:w-1/2 justify-end">
                        <button data-workshop-id="${workshop.id}" class="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 view-detailed-btn shadow-md" ${canViewAccount}><i class="fas fa-money-bill-transfer ml-2"></i> إضافة دفعة/خصم</button>
                        <button data-workshop-id="${workshop.id}" class="p-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 view-detailed-history-btn shadow-md" ${canViewAccount}><i class="fas fa-file-invoice-dollar ml-2"></i> سجل الحساب التفصيلي</button>
                    </div>
                </div>`;
    })
    .join('');

  // --- Double Submission Fix: Cloning and Permission Check for list buttons ---
  document.querySelectorAll('.view-detailed-btn').forEach((btn) => {
    const newBtn = btn.cloneNode(true) as HTMLButtonElement;
    btn.parentNode!.replaceChild(newBtn, btn);
    if (newBtn.disabled) {
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showPermissionDeniedMessage('accounts');
      });
    } else {
      newBtn.addEventListener('click', (e) => {
        const workshopId = (e.target as HTMLElement).dataset.workshopId!;
        viewDetailedAccountModal(workshopId);
      });
    }
  });

  document.querySelectorAll('.view-detailed-history-btn').forEach((btn) => {
    const newBtn = btn.cloneNode(true) as HTMLButtonElement;
    btn.parentNode!.replaceChild(newBtn, btn);
    if (newBtn.disabled) {
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showPermissionDeniedMessage('accounts');
      });
    } else {
      newBtn.addEventListener('click', (e) => {
        const workshopId = (e.target as HTMLElement).dataset.workshopId!;
        viewDetailedAccountHistoryModal(workshopId);
      });
    }
  });
}

/**
 * عرض النافذة المنبثقة لإضافة المعاملات اليدوية (دفعات أو خصومات)
 */
function viewDetailedAccountModal(workshopId: string) {
  const modal = document.getElementById('detailed-accounts-modal')!;
  const workshop = allWorkshops.find((w) => w.id === workshopId);

  const {
    totalDue,
    totalPayments,
    totalDeductions,
    balance,
    owedItemsForDisplay,
  } = calculateWorkshopBalance(workshopId);

  let itemsHtml = '';

  if (owedItemsForDisplay.length > 0) {
    itemsHtml = owedItemsForDisplay
      .map(
        (item: any) => `
                    <div class="p-2 border-b last:border-b-0 flex justify-between items-center bg-white rounded-md shadow-sm border-r-4 border-red-400">
                        <div>
                            <p class="font-medium text-sm">${item.model_name || 'غير محدد'} - ${item.size_name}</p>
                            <p class="text-xs text-gray-500">${item.quantity} قطعة متبقية @ ${item.price.toFixed(2)} ج.م</p>
                        </div>
                        <p class="font-bold text-red-600">${item.cost.toFixed(2)} ج.م</p> 
                    </div>
                `,
      )
      .join('');
  } else {
    itemsHtml =
      '<p class="text-center text-gray-500">لا توجد قطع غير مدفوعة حالياً. تم تغطية جميع المستحقات حتى الآن.</p>';
  }

  const balanceColor = balance > 0 ? 'text-red-600' : 'text-green-600';
  const balanceText = balance > 0 ? 'مستحق للورشة' : 'رصيد لصالح المصنع';

  // Apply fixed structure to enable scrolling for content
  modal.innerHTML = `
                <div class="modal-content-wrapper container-card border-t-4 border-blue-600">
                    <div class="modal-header flex justify-between items-center border-b pb-3 mb-4">
                        <h3 class="text-2xl font-bold text-gray-800">إدارة حساب ورشة ${workshop.name}</h3>
                        <button onclick="closeModal('detailed-accounts-modal')" class="text-red-500 hover:text-red-700 p-2 rounded-full bg-gray-100 w-10 h-10 flex items-center justify-center">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    
                    <div class="modal-body space-y-6">
                        <div class="p-4 bg-gray-100 rounded-xl shadow-inner border border-gray-200">
                            <p class="text-lg font-extrabold flex justify-between">
                                <span>إجمالي المستحق (القطع):</span> <span class="text-blue-600">${totalDue.toFixed(2)} ج.م</span>
                            </p>
                            <p class="text-lg font-extrabold flex justify-between">
                                <span>إجمالي المدفوع (نقدية):</span> <span class="text-green-600">${totalPayments.toFixed(2)} ج.م</span>
                            </p>
                                <p class="text-lg font-extrabold flex justify-between">
                                <span>إجمالي الخصومات/تلفيات:</span> <span class="text-red-600">${totalDeductions.toFixed(2)} ج.م</span>
                            </p>
                            <p class="text-2xl font-extrabold border-t-2 border-gray-300 pt-2 mt-2 flex justify-between">
                                <span>الرصيد المتبقي:</span> <span class="${balanceColor}">${Math.abs(balance).toFixed(2)} ج.م</span>
                            </p>
                            <p class="text-xs text-center ${balanceColor} font-bold mt-1">(${balanceText})</p>
                        </div>

                        <div class="space-y-2 bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <h4 class="text-lg font-bold border-b pb-1 text-gray-700">تفاصيل القطع المستحقة (Owed Items)</h4>
                            <div class="max-h-48 overflow-y-auto space-y-2">
                                ${itemsHtml}
                            </div>
                        </div>
                        
                        <div class="p-4 bg-white rounded-xl shadow-md border border-gray-200">
                            <h4 class="text-xl font-bold mb-4 border-b pb-2 text-gray-800">إضافة دفعة/خصم يدوي</h4>
                            <div class="space-y-4">
                                <div>
                                    <label for="transaction-amount" class="block text-sm font-medium">المبلغ (بالجنيه المصري)</label>
                                    <input type="number" step="0.01" id="transaction-amount" class="p-3 w-full border rounded-lg shadow-sm" placeholder="أدخل المبلغ">
                                </div>
                                <div>
                                    <label for="transaction-type" class="block text-sm font-medium">النوع</label>
                                    <select id="transaction-type" class="p-3 w-full border rounded-lg shadow-sm">
                                        <option value="payment">دفعة للورشة (تخفيض مستحق الورشة)</option>
                                        <option value="discount">خصم/تلفيات (إضافة لرصيد المصنع)</option>
                                    </select>
                                </div>
                                <div>
                                    <label for="transaction-notes" class="block text-sm font-medium">ملاحظات</label>
                                    <textarea id="transaction-notes" rows="2" class="p-3 w-full border rounded-lg shadow-sm" placeholder="ملاحظات حول المعاملة"></textarea>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer flex justify-end gap-4 mt-6 border-t pt-4">
                        <button id="save-transaction-btn" data-workshop-id="${workshopId}" class="p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold shadow-md"><i class="fas fa-plus ml-2"></i> حفظ المعاملة</button>
                        <button id="view-transactions-btn" data-workshop-id="${workshopId}" class="p-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-bold shadow-md"><i class="fas fa-list-check ml-2"></i> سجل الدفعات</button>
                    </div>
                </div>`;
  modal.classList.add('active');

  // --- Double Submission Fix: Cloning for buttons in modal ---
  const saveTransactionBtn = document.getElementById('save-transaction-btn')!;
  const newSaveTransactionBtn = saveTransactionBtn.cloneNode(true) as HTMLButtonElement;
  saveTransactionBtn.parentNode!.replaceChild(
    newSaveTransactionBtn,
    saveTransactionBtn,
  );

  const viewTransactionsBtn = document.getElementById('view-transactions-btn')!;
  const newViewTransactionsBtn = viewTransactionsBtn.cloneNode(true) as HTMLButtonElement;
  viewTransactionsBtn.parentNode!.replaceChild(
    newViewTransactionsBtn,
    viewTransactionsBtn,
  );

  if (!userPermissions.accounts) {
    newSaveTransactionBtn.disabled = true;
    newSaveTransactionBtn.title = 'ليس لديك صلاحية لإضافة معاملات مالية.';
    newSaveTransactionBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showPermissionDeniedMessage('accounts');
    });
    newViewTransactionsBtn.disabled = true;
    newViewTransactionsBtn.title = 'ليس لديك صلاحية لعرض السجلات المالية.';
    newViewTransactionsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showPermissionDeniedMessage('accounts');
    });
  } else {
    newSaveTransactionBtn.addEventListener('click', async (e) => {
      const workshopId = (e.target as HTMLElement).dataset.workshopId!;
      // Fix: Cast elements to access .value
      const amount = parseFloat(
        (document.getElementById('transaction-amount') as HTMLInputElement).value,
      );
      const type = (document.getElementById('transaction-type') as HTMLSelectElement).value;
      const notes = (document.getElementById('transaction-notes') as HTMLTextAreaElement).value.trim();

      if (isNaN(amount) || amount <= 0)
        return showMessage('الرجاء إدخال مبلغ صحيح وموجب.', 'error');

      try {
        const finalAmount = type === 'payment' ? amount : -amount;

        await addDoc(collection(db, `users/${userId!}/transactions`), {
          workshopId,
          amount: finalAmount,
          type,
          notes,
          created_at: new Date(),
        });
        showMessage('تم حفظ المعاملة بنجاح!', 'success');
        viewDetailedAccountModal(workshopId);
      } catch (err: any) {
        console.error('Error saving transaction:', err);
        showMessage(`فشل حفظ المعاملة: ${err.message}`, 'error');
      }
    });

    newViewTransactionsBtn.addEventListener('click', (e) => {
      const workshopId = (e.currentTarget as HTMLElement).dataset.workshopId!;
      openTransactionsModal(workshopId);
    });
  }
}

/**
 * عرض سجل الدفعات والخصومات لورشة معينة
 */
function openTransactionsModal(workshopId: string) {
  const modal = document.getElementById('transactions-modal')!;
  const workshop = allWorkshops.find((w) => w.id === workshopId);
  const transactions = allTransactions
    .filter((t) => t.workshopId === workshopId)
    .sort((a, b) => b.created_at.toMillis() - a.created_at.toMillis());

  const transactionsHtml = transactions
    .map((t) => {
      const isPayment = t.type === 'payment';
      const amountClass = isPayment ? 'text-green-600' : 'text-red-600';
      const typeText = isPayment ? 'دفعة نقدية' : 'خصم/تلفيات';
      const sign = isPayment ? '+' : '';
      return `<div class="p-3 border-b last:border-b-0 flex justify-between items-center bg-white rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
                    <div>
                        <p class="text-sm text-gray-500">${t.created_at.toDate().toLocaleString('ar-EG')}</p>
                        <p class="font-extrabold ${amountClass} text-lg">
                            ${typeText}: ${sign}${(Math.abs(t.amount)).toFixed(2)} ج.م
                        </p>
                        <p class="text-xs text-gray-400">ملاحظات: ${t.notes || 'لا توجد'}</p>
                    </div>
                    <button class="text-red-500 hover:text-red-700 delete-transaction-btn p-2" data-id="${t.id}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>`;
    })
    .join('');

  // Apply fixed structure to enable scrolling for content
  modal.innerHTML = `
                <div class="modal-content-wrapper container-card border-t-4 border-yellow-600">
                    <div class="modal-header flex justify-between items-center border-b pb-3 mb-4">
                        <h3 class="text-2xl font-bold text-gray-800">سجل الدفعات والخصومات لورشة ${workshop.name}</h3>
                        <button onclick="closeModal('transactions-modal')" class="text-red-500 hover:text-red-700 p-2 rounded-full bg-gray-100 w-10 h-10 flex items-center justify-center">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    
                    <div class="modal-body space-y-3 bg-gray-100 p-4 rounded-xl shadow-inner">
                        <h4 class="text-lg font-bold border-b pb-1 text-gray-700">المعاملات:</h4>
                        ${transactionsHtml || '<p class="text-center text-gray-500 p-4">لا يوجد سجل معاملات نقدية لهذه الورشة.</p>'}
                    </div>
                    <div class="modal-footer flex justify-end gap-4 mt-6 border-t pt-4">
                        <button onclick="closeModal('transactions-modal')" class="p-3 bg-gray-400 text-white rounded-lg hover:bg-gray-500 font-bold">إغلاق</button>
                    </div>
                </div>`;
  modal.classList.add('active');

  document
    .querySelectorAll('.delete-transaction-btn')
    .forEach((btn) =>
      btn.addEventListener('click', (e) => {
        const transactionId = (e.currentTarget as HTMLElement).dataset.id!;
        showDeleteTransactionConfirmModal(transactionId);
      }),
    );
}

/**
 * عرض نافذة تأكيد حذف معاملة دفع/خصم
 */
function showDeleteTransactionConfirmModal(transactionId: string) {
  const modal = document.getElementById('delete-transaction-confirm-modal')!;
  const confirmBtn = document.getElementById('confirm-delete-transaction-btn')!;

  // --- Double Submission Fix: Cloning for confirm delete transaction button ---
  const newConfirmBtn = confirmBtn.cloneNode(true) as HTMLElement;
  confirmBtn.parentNode!.replaceChild(newConfirmBtn, confirmBtn);

  newConfirmBtn.onclick = async () => {
    await deleteTransaction(transactionId);
    closeModal('delete-transaction-confirm-modal');
  };

  modal.classList.add('active');
}

/**
 * عرض سجل حسابات تسليم القطع التفصيلي
 */
function viewDetailedAccountHistoryModal(workshopId: string) {
  const modal = document.getElementById('detailed-accounts-history-modal')!;
  const workshop = allWorkshops.find((w) => w.id === workshopId);
  const {completedItems} = calculateWorkshopBalance(workshopId);

  let itemsHtml = '';
  if (completedItems.length > 0) {
    itemsHtml = completedItems
      .sort((a, b) => b.delivery_date.toMillis() - a.delivery_date.toMillis())
      .map(
        (item: any) => `
                    <div class="p-3 border-b last:border-b-0 bg-white rounded-lg shadow-sm border-l-4 border-green-400">
                        <div class="flex justify-between items-start">
                            <div class="w-full">
                                <p class="font-bold text-md text-gray-800">${item.model_name || 'غير محدد'} - ${item.size_name}</p>
                                <p class="text-sm text-gray-600">${item.quantity} قطعة @ ${item.price.toFixed(2)} ج.م</p>
                                <p class="text-xs text-gray-500">تاريخ التسليم: ${item.delivery_date.toDate().toLocaleString('ar-EG')}</p>
                            </div>
                            <div class="flex flex-col items-end">
                                <p class="font-extrabold text-lg text-green-600 mb-2">${item.cost.toFixed(2)} ج.م</p>
                                <button class="p-1 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 delete-delivery-from-history-btn shadow-sm" 
                                             data-assignment-id="${item.assignmentId}" 
                                             data-size-name="${item.size_name}" 
                                             data-history-index="${item.historyIndex}">
                                    <i class="fas fa-trash-alt"></i> حذف التسليم
                                </button>
                            </div>
                        </div>
                    </div>
                `,
      )
      .join('');
  } else {
    itemsHtml =
      '<p class="text-center text-gray-500 p-4">لا يوجد سجل قطع تم تسليمها لهذه الورشة.</p>';
  }

  // Apply fixed structure to enable scrolling for content
  modal.innerHTML = `
                <div class="modal-content-wrapper container-card border-t-4 border-yellow-600">
                    <div class="modal-header flex justify-between items-center border-b pb-3 mb-4">
                        <h3 class="text-2xl font-bold text-gray-800">سجل حسابات تسليم القطع لورشة ${workshop.name}</h3>
                        <button onclick="closeModal('detailed-accounts-history-modal')" class="text-red-500 hover:text-red-700 p-2 rounded-full bg-gray-100 w-10 h-10 flex items-center justify-center">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    
                    <div class="modal-body space-y-3 bg-gray-100 p-4 rounded-xl shadow-inner">
                        <h4 class="text-lg font-bold border-b pb-1 text-gray-700">تفاصيل القطع المكتملة (دين الورشة)</h4>
                        ${itemsHtml}
                    </div>
                    
                    <div class="modal-footer flex justify-end gap-4 mt-6 border-t pt-4">
                        <button onclick="closeModal('detailed-accounts-history-modal')" class="p-3 bg-gray-400 text-white rounded-lg hover:bg-gray-500 font-bold">إغلاق</button>
                    </div>
                </div>`;
  modal.classList.add('active');

  document
    .querySelectorAll('.delete-delivery-from-history-btn')
    .forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const {assignmentId, sizeName, historyIndex} = (e.currentTarget as HTMLElement).dataset;
        showDeleteDeliveryConfirmModal(
          assignmentId!,
          sizeName!,
          parseInt(historyIndex!),
        );
      });
    });
}

/**
 * عرض نافذة تأكيد حذف سجل تسليم
 */
function showDeleteDeliveryConfirmModal(assignmentId: string, sizeName: string, historyIndex: number) {
  const modal = document.getElementById('delete-delivery-confirm-modal')!;
  const confirmBtn = document.getElementById('confirm-delete-delivery-btn')! as HTMLButtonElement;

  confirmBtn.onclick = async () => {
    await deleteDeliveryTransaction(assignmentId, sizeName, historyIndex);
    closeModal('delete-delivery-confirm-modal');
  };

  modal.classList.add('active');
}

// ====================================================================
// 9. لوحة التحكم والإعدادات (DASHBOARD & SETTINGS)
// ====================================================================

/**
 * عرض لوحة التحكم
 */
function renderDashboard() {
  const page = document.getElementById('dashboard-page')!;

  const inProgressCuttings = allCuttings.filter(
    (c) => c.status !== 'Completed' && c.status !== 'Sold',
  );

  const totalPieces = inProgressCuttings.reduce(
    (sum, c) => sum + c.total_pieces,
    0,
  );
  const remainingPieces = inProgressCuttings.reduce(
    (sum, c) => sum + c.remaining_pieces,
    0,
  );

  const totalDelivered = allCuttings.reduce((sum, c) => {
    if (c.status !== 'Sold') {
      return sum + (c.received_pieces || 0);
    }
    return sum;
  }, 0);

  const activeWorkshopIds = new Set(
    allAssignments
      .filter((a) => a.assigned_sizes.some((s: any) => s.delivered < s.quantity))
      .map((a) => a.workshopId),
  );
  const activeWorkshopsCount = activeWorkshopIds.size;

  let notifications = '';
  const hasNoCutting = inProgressCuttings.length === 0;
  if (hasNoCutting && notificationSettings.noCutting) {
    notifications += `<p class="p-2 bg-yellow-100 rounded-lg">لا توجد قصص قيد العمل. يرجى تجهيز قص جديد.</p>`;
  }

  allWorkshops.forEach((workshop) => {
    const balance = calculateWorkshopBalance(workshop.id).balance;
    if (balance > 0 && notificationSettings.workshopBalance) {
      notifications += `<p class="p-2 bg-red-100 rounded-lg">الورشة <strong>${workshop.name}</strong> لديها رصيد مستحق بقيمة <strong>${balance.toFixed(2)}</strong>.</p>`;
    }
  });

  const cuttingMap = new Map(allCuttings.map((c) => [c.id, c]));
  const workshopMap = new Map(allWorkshops.map((w) => [w.id, w]));
  
  // Fix: Type the workshopSummary object
  const modelSummary: { [key: string]: number } = {};
  inProgressCuttings.forEach((c) => {
    modelSummary[c.model_name] =
      (modelSummary[c.model_name] || 0) + c.remaining_pieces;
  });
  const modelSummaryHtml = Object.entries(modelSummary)
    .map(
      ([model, pieces]) => `
                <div class="flex justify-between items-center p-3 bg-gray-100 rounded-lg border-r-4 border-blue-400 shadow-sm hover:bg-gray-200 transition-colors">
                    <span class="font-medium">${model}</span>
                    <span class="font-extrabold text-lg text-blue-800">${pieces} قطعة</span>
                </div>
            `,
    )
    .join('');
  
  // Fix: Type the workshopSummary object
  const workshopSummary: { [key: string]: { assigned: number; delivered: number } } = {};
  allAssignments.forEach((a) => {
    const workshopName = workshopMap.get(a.workshopId)?.name || 'غير معروفة';
    const assignedQuantity = a.assigned_sizes.reduce(
      (sum: number, s: any) => sum + s.quantity,
      0,
    );
    const deliveredQuantity = a.assigned_sizes.reduce(
      (sum: number, s: any) => sum + s.delivered,
      0,
    );

    if (!workshopSummary[workshopName]) {
      workshopSummary[workshopName] = {assigned: 0, delivered: 0};
    }
    workshopSummary[workshopName].assigned += assignedQuantity;
    workshopSummary[workshopName].delivered += deliveredQuantity;
  });
  const workshopSummaryHtml = Object.entries(workshopSummary)
    .map(
      ([workshop, data]) => `
                <div class="p-4 bg-white rounded-xl shadow-md border-b-2 border-gray-200">
                    <p class="font-bold mb-2 text-gray-700">${workshop}</p>
                    <ul class="space-y-1 text-sm">
                        <li class="flex justify-between">
                            <span>إجمالي الموزع:</span>
                            <span class="font-extrabold text-blue-600">${data.assigned}</span>
                        </li>
                        <li class="flex justify-between">
                            <span>إجمالي المستلم:</span>
                            <span class="font-extrabold text-green-600">${data.delivered}</span>
                        </li>
                        <li class="flex justify-between border-t mt-1 pt-1 border-gray-100">
                            <span>المتبقي في الورشة:</span>
                            <span class="font-extrabold text-red-600">${data.assigned - data.delivered}</span>
                        </li>
                    </ul>
                </div>
            `,
    )
    .join('');

  page.innerHTML = `
                <h2 class="text-3xl font-extrabold text-center mb-6 text-gray-900">لوحة التحكم التنفيذية</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div class="card bg-blue-50 text-blue-800 p-6 rounded-xl shadow-lg border-l-4 border-blue-600"><h3 class="text-xl font-bold">إجمالي القص الحالي</h3><p class="text-5xl mt-2 font-extrabold">${totalPieces}</p></div>
                    <div class="card bg-green-50 text-green-800 p-6 rounded-xl shadow-lg border-l-4 border-green-600"><h3 class="text-xl font-bold">عدد الورش قيد العمل</h3><p class="text-5xl mt-2 font-extrabold">${activeWorkshopsCount}</p></div>
                    <div class="card bg-yellow-50 text-yellow-800 p-6 rounded-xl shadow-lg border-l-4 border-yellow-600"><h3 class="text-xl font-bold">المتبقي للتوزيع</h3><p class="text-5xl mt-2 font-extrabold">${remainingPieces}</p></div>
                    <div class="card bg-purple-50 text-purple-800 p-6 rounded-xl shadow-lg border-l-4 border-purple-600"><h3 class="text-xl font-bold">إجمالي المستلم للمصنع</h3><p class="text-5xl mt-2 font-extrabold">${totalDelivered}</p></div>
                </div>
                <div id="dashboard-notifications" class="mt-6 p-4 rounded-xl shadow-lg bg-red-100 text-red-800 border-l-4 border-red-600 ${notifications ? '' : 'hidden'}">
                    <h3 class="text-xl font-bold mb-2">تنبيهات حرجة</h3>
                    ${notifications}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    <div class="p-6 bg-white rounded-xl shadow-xl border-t-4 border-blue-400">
                        <h3 class="text-2xl font-bold mb-4 text-gray-800">ملخص القطع حسب الموديل (قيد القص)</h3>
                        <div class="space-y-3 max-h-80 overflow-y-auto" id="model-summary-dashboard">
                            ${modelSummaryHtml || '<p class="text-center text-gray-500">لا توجد موديلات قيد القص.</p>'}
                        </div>
                    </div>
                    <div class="p-6 bg-white rounded-xl shadow-xl border-t-4 border-green-400">
                        <h3 class="text-2xl font-bold mb-4 text-gray-800">ملخص حالة الورش (التوزيع والاستلام)</h3>
                        <div id="workshop-summary-dashboard" class="space-y-3 max-h-80 overflow-y-auto">
                            ${workshopSummaryHtml || '<p class="text-center text-gray-500">لا توجد توزيعات مسجلة.</p>'}
                        </div>
                    </div>
                </div>
                `;
}

/**
 * عرض صفحة الإعدادات
 */
function renderSettingsPage() {
  const page = document.getElementById('settings-page')!;
  const isAdminSection = userRole === 'owner'
    ? `
                <div class="p-6 bg-red-100 rounded-xl mb-6 shadow-xl border-t-4 border-red-600">
                    <h3 class="text-2xl font-semibold mb-4 text-red-800">إعدادات المدير (خطيرة!)</h3>
                    <p class="text-red-700 mb-4">هذا الإجراء سيحذف جميع بياناتك (قص، توزيعات، معاملات) بشكل دائم. استخدمه بحذر.</p>
                    <button id="factory-reset-btn" class="w-full p-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 shadow-md">
                        <i class="fas fa-trash-alt ml-2"></i> حذف واستعادة إعدادات المصنع بالكامل
                    </button>
                </div>
            `
    : '';

  page.innerHTML = `
                <h2 class="text-3xl font-extrabold text-center mb-6 text-gray-900">إعدادات التطبيق</h2>
                <div class="space-y-6">
                    ${isAdminSection}

                    <div class="p-6 bg-blue-50 rounded-xl mb-6 shadow-xl border-t-4 border-blue-600">
                        <h3 class="text-2xl font-semibold mb-4 text-blue-800">إعدادات الإشعارات والعرض</h3>
                        <div class="space-y-3">
                            <label class="flex items-center space-x-3 space-x-reverse p-3 bg-white rounded-lg shadow-sm border border-blue-200 cursor-pointer">
                                <input type="checkbox" id="setting-no-cutting" class="form-checkbox h-5 w-5 text-blue-600 rounded">
                                <span class="text-gray-700">تنبيه عند عدم وجود قصص قيد العمل في لوحة التحكم.</span>
                            </label>
                            <label class="flex items-center space-x-3 space-x-reverse p-3 bg-white rounded-lg shadow-sm border border-blue-200 cursor-pointer">
                                <input type="checkbox" id="setting-workshop-balance" class="form-checkbox h-5 w-5 text-blue-600 rounded">
                                <span class="text-gray-700">تنبيه عند وجود رصيد مستحق للورشة في لوحة التحكم (رصيد موجب).</span>
                            </label>
                            <label class="flex items-center space-x-3 space-x-reverse p-3 bg-white rounded-lg shadow-sm border border-blue-200 cursor-pointer">
                                <input type="checkbox" id="setting-cutting-history-48h" class="form-checkbox h-5 w-5 text-blue-600 rounded">
                                <span class="text-gray-700">إظهار سجل القص المكتمل والمباع لآخر 48 ساعة فقط.</span>
                            </label>
                        </div>
                        <button id="save-settings-btn" class="mt-6 w-full p-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-md">
                            <i class="fas fa-save ml-2"></i> حفظ الإعدادات
                        </button>
                    </div>
                </div>
            `;

  // Load and apply current settings
  // Fix: Cast elements to HTMLInputElement
  (document.getElementById('setting-no-cutting') as HTMLInputElement).checked =
    notificationSettings.noCutting;
  (document.getElementById('setting-workshop-balance') as HTMLInputElement).checked =
    notificationSettings.workshopBalance;
  (document.getElementById('setting-cutting-history-48h') as HTMLInputElement).checked =
    notificationSettings.cuttingHistory48hEnabled;

  // --- Double Submission Fix: Cloning for save settings button ---
  const saveSettingsBtn = document.getElementById('save-settings-btn')!;
  const newSaveSettingsBtn = saveSettingsBtn.cloneNode(true);
  saveSettingsBtn.parentNode!.replaceChild(newSaveSettingsBtn, saveSettingsBtn);

  newSaveSettingsBtn.addEventListener('click', () => {
    // Fix: Cast elements to HTMLInputElement
    notificationSettings.noCutting =
      (document.getElementById('setting-no-cutting') as HTMLInputElement).checked;
    notificationSettings.workshopBalance = (document.getElementById(
      'setting-workshop-balance',
    ) as HTMLInputElement).checked;
    notificationSettings.cuttingHistory48hEnabled = (document.getElementById(
      'setting-cutting-history-48h',
    ) as HTMLInputElement).checked;
    saveSettings();
    showMessage('تم حفظ الإعدادات بنجاح!', 'success');
    renderCuttings(); // Re-render cutting to reflect history setting change
  });

  if (userRole==='owner') {
    document.getElementById('factory-reset-btn')!.addEventListener('click', () => {
      document.getElementById('reset-confirm-modal')!.classList.add('active');
    });
  }
}

// ====================================================================
// 10. أدوات المدير (ADMIN TOOLS)
// ====================================================================

/**
 * تبديل حالة فتح/إغلاق تسجيل المستخدمين الجدد.
 */
async function toggleGlobalRegistration(status: boolean) {
  if (userRole !== 'owner') return showPermissionDeniedMessage('user_management');

  try {
    await setDoc(APP_SETTINGS_REF, {isRegistrationOpen: status}, {merge: true});
    showMessage(`تم ${status ? 'فتح' : 'إغلاق'} التسجيل بنجاح!`, 'success');
  } catch (err: any) {
    console.error('Error toggling registration:', err);
    showMessage(`فشل تغيير حالة التسجيل: ${err.message}`, 'error');
  }
}

/**
 * حفظ عدد الأيام الافتراضية للفترة التجريبية.
 */
async function saveDefaultTrialDays(days: number) {
  if (userRole !== 'owner') return showPermissionDeniedMessage('user_management');
  if (isNaN(days) || days < 1)
    return showMessage('الرجاء إدخال عدد صحيح وموجب للأيام.', 'خطأ في الإدخال');

  try {
    await setDoc(APP_SETTINGS_REF, {defaultTrialDays: days}, {merge: true});
    showMessage(
      `تم تعيين الفترة التجريبية الافتراضية إلى ${days} يوم بنجاح!`,
      'success',
    );
  } catch (err: any) {
    console.error('Error saving trial days:', err);
    showMessage(`فشل حفظ الإعداد: ${err.message}`, 'error');
  }
}

/**
 * إنشاء مستخدم جديد يدويًا وتعيين الاشتراك.
 */
async function createManualUser(email: string, password: string, expiryDate: Date) {
  if (userRole !== 'owner') return showPermissionDeniedMessage('user_management');

  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );
    const uid = userCredential.user.uid;

    const userRef = doc(db, 'users_metadata', uid);
    await setDoc(userRef, {
      email: email,
      role: 'office',
      subscription_expires: toTimestamp(expiryDate),
      created_at: new Date(),
      trial_period_days: Math.ceil(
        (expiryDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24),
      ),
      permissions: DEFAULT_PERMISSIONS,
    });

    (document.getElementById('manual-user-email') as HTMLInputElement).value = '';
    (document.getElementById('manual-user-password') as HTMLInputElement).value = '';
    (document.getElementById('manual-user-expiry') as HTMLInputElement).value = '';

    showMessage(
      `تم إنشاء المستخدم ${email} بنجاح! الاشتراك ينتهي في ${expiryDate.toLocaleDateString('ar-EG')}.`,
      'success',
    );
  } catch (err: any) {
    console.error('Error creating manual user:', err);
    showCustomMessage(
      `فشل إنشاء المستخدم: ${err.message}`,
      'خطأ في المصادقة',
    );
  }
}

/**
 * تحديث صلاحيات واشتراك مستخدم معين
 */
async function updateUserSubscriptionAndRole(
  uid: string,
  email: string,
  expiryDate: Date | null,
  newRole: 'owner' | 'office',
  permissions: UserPermissions,
) {
  if (!userId || userRole !== 'owner') return showPermissionDeniedMessage('user_management');

  try {
    const userRef = doc(db, 'users_metadata', uid);
    const expiryTimestamp = toTimestamp(expiryDate);

    if (email === ADMIN_EMAIL && newRole !== 'owner') {
      showCustomMessage(
        'لا يمكن إلغاء صلاحية المدير للمستخدم الرئيسي للنظام.',
        'خطأ في الصلاحيات',
      );
      return;
    }

    await updateDoc(userRef, {
      role: newRole,
      subscription_expires: expiryTimestamp,
      permissions: permissions,
    });

    showMessage(
      `تم تحديث صلاحيات واشتراك المستخدم ${email} بنجاح!`,
      'success',
    );

    // If the current user's permissions were changed, trigger a recheck
    if (uid === userId) {
      await checkUserAccessAndPermissions(auth.currentUser);
    }
  } catch (err: any) {
    console.error('Error updating user metadata:', err);
    showMessage(`فشل تحديث بيانات المستخدم: ${err.message}`, 'error');
  }
}

/**
 * عرض صفحة إدارة المستخدمين (للمدير فقط)
 */
function renderUserManagementPage() {
  const page = document.getElementById('user-management-page');
  if (!page || userRole !== 'owner') {
    if (page)
      page.innerHTML =
        '<p class="text-center text-red-500 text-xl font-bold">لا توجد صلاحية للوصول إلى هذه الصفحة.</p>';
    return;
  }

  const sortedUsers = allUsersMetadata.sort(
    (a, b) =>
      (b.created_at?.toMillis() || 0) - (a.created_at?.toMillis() || 0),
  );

  const usersHtml = sortedUsers
    .map((user) => {
      const expiryDate = user.subscription_expires
        ? user.subscription_expires.toDate()
        : null;
      const isExpired = expiryDate ? expiryDate <= new Date() : true;
      const expiryText = expiryDate
        ? expiryDate.toLocaleDateString('ar-EG')
        : 'غير محدد';
      const statusClass = isExpired
        ? 'bg-red-100 text-red-800 border-red-300'
        : 'bg-green-100 text-green-800 border-green-300';
      const roleText = user.role === 'owner' ? 'مالك' : 'مكتب';
      return `
                    <div class="p-4 border-2 rounded-xl shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center ${statusClass}">
                        <div class="w-full md:w-3/5 space-y-1 mb-4 md:mb-0">
                            <p class="font-bold text-lg text-gray-800">${user.email}</p>
                            <p class="text-sm text-gray-700">UID: <span class="font-mono text-xs">${user.id.slice(0, 15)}...</span></p>
                            <p class="text-sm font-bold">الدور: <span class="${user.role === 'owner' ? 'text-red-600' : 'text-blue-600'}">${roleText}</span></p>
                            <p class="text-sm font-bold">انتهاء الاشتراك: <span class="${isExpired ? 'text-red-600' : 'text-green-600'}">${expiryText}</span></p>
                            ${isExpired ? '<p class="text-xs text-red-600 font-bold bg-white p-1 rounded-md inline-block">الاشتراك منتهي!</p>' : ''}
                        </div>
                        <div class="w-full md:w-2/5 flex justify-end">
                            <button class="p-2 bg-yellow-600 text-white font-bold rounded-lg hover:bg-yellow-700 edit-subscription-btn shadow-md" 
                                data-uid="${user.id}" 
                                data-email="${user.email}"
                                data-role="${user.role || 'office'}"
                                data-expiry="${toDateString(user.subscription_expires)}"
                                data-permissions='${JSON.stringify(user.permissions || DEFAULT_PERMISSIONS)}'>
                                <i class="fas fa-edit ml-2"></i> تعديل الصلاحيات
                            </button>
                        </div>
                    </div>
                `;
    })
    .join('');

  page.innerHTML = `
                <h2 class="text-3xl font-extrabold text-center mb-6 text-gray-900 border-b-2 pb-2 border-gray-200">إدارة المستخدمين والاشتراكات</h2>
                
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div class="p-6 bg-purple-100 rounded-xl mb-4 shadow-lg flex justify-between items-center border border-purple-300">
                        <h3 class="text-xl font-bold text-purple-800">التحكم في التسجيل العام</h3>
                        <div class="flex items-center space-x-4 space-x-reverse">
                            <span id="registration-status-text" class="font-bold text-lg text-purple-700"></span>
                            <button id="toggle-registration-btn" class="p-3 text-white font-bold rounded-lg transition-all w-32 shadow-md"></button>
                        </div>
                    </div>

                    <div class="p-6 bg-green-100 rounded-xl mb-4 shadow-lg flex justify-between items-center border border-green-300 flex-wrap gap-4">
                        <h3 class="text-xl font-bold text-green-800">إعداد الفترة التجريبية الافتراضية</h3>
                        <div class="flex items-center space-x-3 space-x-reverse w-full md:w-auto justify-end">
                            <label for="default-trial-days" class="font-bold text-green-700 whitespace-nowrap">أيام التجربة:</label>
                            <input type="number" id="default-trial-days" value="${defaultTrialDays}" min="7" max="365" class="p-2 border border-green-400 rounded-lg w-20 text-center shadow-sm">
                            <button id="save-trial-settings-btn" class="p-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-all shadow-md">حفظ المدة</button>
                        </div>
                    </div>
                </div>

                <div class="p-6 bg-blue-100 rounded-xl mb-6 shadow-xl space-y-4 border border-blue-300">
                    <h3 class="text-2xl font-extrabold text-blue-800 border-b pb-2 mb-4">إنشاء حساب جديد يدوياً (للمدفوعين)</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <input type="email" id="manual-user-email" placeholder="بريد المستخدم الجديد" class="w-full p-3 border-2 border-blue-300 rounded-lg shadow-sm" required>
                        <input type="password" id="manual-user-password" placeholder="كلمة المرور (6+ أحرف)" class="w-full p-3 border-2 border-blue-300 rounded-lg shadow-sm" required>
                        <input type="date" id="manual-user-expiry" title="تاريخ انتهاء الاشتراك" class="w-full p-3 border-2 border-blue-300 rounded-lg shadow-sm" placeholder="تاريخ انتهاء الاشتراك">
                    </div>
                    <p class="text-xs text-gray-600 mt-1">تاريخ انتهاء الاشتراك إجباري لإنشاء حساب مدفوع يدوياً.</p>
                    <button id="create-manual-user-btn" class="w-full p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-all shadow-lg">
                        <i class="fas fa-plus-circle ml-2"></i> إنشاء المستخدم وتعيين الاشتراك
                    </button>
                </div>

                <div class="p-4 bg-gray-50 rounded-xl mb-6 shadow-inner">
                    <h3 class="text-2xl font-extrabold mb-4 text-gray-800">قائمة المستخدمين المسجلين (${allUsersMetadata.length})</h3>
                    <div id="users-list-container" class="space-y-4">
                        ${usersHtml || '<p class="text-center text-gray-500">لا يوجد مستخدمون مسجلون في النظام.</p>'}
                    </div>
                </div>
            `;
  
  const statusText = document.getElementById('registration-status-text')!;
  const toggleBtn = document.getElementById('toggle-registration-btn') as HTMLButtonElement;
  if (isRegistrationOpen) { statusText.textContent = 'التسجيل مفتوح'; toggleBtn.textContent = 'إغلاق التسجيل'; toggleBtn.className = 'p-3 text-white font-bold rounded-lg transition-all w-32 shadow-md bg-red-600 hover:bg-red-700'; } else { statusText.textContent = 'التسجيل مغلق'; toggleBtn.textContent = 'فتح التسجيل'; toggleBtn.className = 'p-3 text-white font-bold rounded-lg transition-all w-32 shadow-md bg-green-600 hover:bg-green-700'; }
  const newToggleBtn = toggleBtn.cloneNode(true); toggleBtn.parentNode!.replaceChild(newToggleBtn, toggleBtn);
  newToggleBtn.addEventListener('click', async () => { await toggleGlobalRegistration(!isRegistrationOpen); });

  const saveTrialBtn = document.getElementById('save-trial-settings-btn')!;
  const trialDaysInput = document.getElementById('default-trial-days') as HTMLInputElement;
  const newSaveTrialBtn = saveTrialBtn.cloneNode(true); saveTrialBtn.parentNode!.replaceChild(newSaveTrialBtn, saveTrialBtn);
  newSaveTrialBtn.addEventListener('click', async () => { const days = parseInt(trialDaysInput.value, 10); await saveDefaultTrialDays(days); });
  
  const createManualBtn = document.getElementById('create-manual-user-btn')!;
  const newCreateManualBtn = createManualBtn.cloneNode(true); createManualBtn.parentNode!.replaceChild(newCreateManualBtn, createManualBtn);
  newCreateManualBtn.addEventListener('click', async () => { const email = (document.getElementById('manual-user-email') as HTMLInputElement).value.trim(); const password = (document.getElementById('manual-user-password') as HTMLInputElement).value.trim(); const expiryDateStr = (document.getElementById('manual-user-expiry') as HTMLInputElement).value; if (!email || !password || password.length < 6 || !expiryDateStr) { return showMessage('الرجاء إدخال بريد إلكتروني، كلمة مرور (6 أحرف على الأقل)، وتاريخ انتهاء اشتراك.', 'error'); } const expiryDate = new Date(expiryDateStr); await createManualUser(email, password, expiryDate); });
  
  document.querySelectorAll('.edit-subscription-btn').forEach((btn) => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode!.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', (e) => {
      const {uid, email, role, expiry, permissions} = (e.currentTarget as HTMLElement).dataset;
      openSubscriptionModal(uid!, email!, role as any, expiry!, JSON.parse(permissions!));
    });
  });
}

function openSubscriptionModal(uid: string, email: string, role: 'owner' | 'office', expiryDate: string, currentPermissions: UserPermissions) {
    const modal = document.getElementById('subscription-management-modal')!;
    const permissionsContainer = document.getElementById('permissions-checkbox-container')!;
    const usernameEl = document.getElementById('sub-modal-username')!;
    const expiryInput = document.getElementById('sub-expiry-date') as HTMLInputElement;
    const adminCheckbox = document.getElementById('sub-is-admin') as HTMLInputElement;
    const saveBtn = document.getElementById('save-subscription-btn')!;

    const userPermissionsToEdit = currentPermissions || DEFAULT_PERMISSIONS;

    permissionsContainer.innerHTML = NAV_LINKS.map(link => {
        if(link.key === 'user_management') return ''; // Handled by admin checkbox
        const isChecked = userPermissionsToEdit[link.key] || false;
        return `<label class="flex items-center space-x-2 space-x-reverse p-2 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-blue-100 transition-all border border-blue-200">
                    <input type="checkbox" class="form-checkbox h-5 w-5 text-blue-600 rounded" ${isChecked ? 'checked' : ''} data-key="${link.key}">
                    <i class="${link.icon} text-gray-500"></i>
                    <span class="text-gray-700 text-sm">${link.label}</span>
                </label>`;
    }).join('');
    
    usernameEl.textContent = `المستخدم: ${email}`;
    expiryInput.value = expiryDate;
    adminCheckbox.checked = role === 'owner';

    if (email === ADMIN_EMAIL) {
        adminCheckbox.disabled = true;
        adminCheckbox.closest('label')!.querySelector('span')!.textContent += ' (لا يمكن تعديله)';
    } else {
        adminCheckbox.disabled = false;
    }

    const newSaveBtn = saveBtn.cloneNode(true); saveBtn.parentNode!.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.addEventListener('click', async () => {
        const newExpiryDate = expiryInput.value ? new Date(expiryInput.value) : null;
        const newRole = adminCheckbox.checked ? 'owner' : 'office';
        
        let newPermissions: any = {};
        permissionsContainer.querySelectorAll('input[type="checkbox"]').forEach(el => {
            const input = el as HTMLInputElement;
            newPermissions[input.dataset.key!] = input.checked;
        });

        if(newRole === 'owner') {
             newPermissions = Object.fromEntries(NAV_LINKS.map(link => [link.key.replace(/-/g, '_'), true]));
        }
        newPermissions.user_management = newRole === 'owner';

        await updateUserSubscriptionAndRole(uid, email, newExpiryDate, newRole, newPermissions);
        closeModal('subscription-management-modal');
    });
    
    modal.classList.add('active');
}
// --- [END OF PASTED EXISTING CODE] ---

// ====================================================================
// 12. Sales, Customers, and Reports (NEW FEATURES)
// ====================================================================

/**
 * عرض صفحة المبيعات (نقطة البيع)
 */
function renderSalesPage() {
    // Implementation for sales page
}

/**
 * عرض صفحة العملاء
 */
function renderCustomersPage() {
    // Implementation for customers page
}

/**
 * عرض صفحة التقارير
 */
function renderReportsPage() {
    // Implementation for reports page
}

/**
 * إضافة عميل جديد
 */
async function addCustomer(name: string, contact: string) {
    // Implementation for adding a customer
}

/**
 * إنشاء فاتورة جديدة
 */
async function createInvoice(customerId: string, customerName: string, paymentType: 'cash' | 'credit', discountPercentage: number, discountFixed: number) {
    // Implementation for creating an invoice
}

/**
 * فتح نافذة الفاتورة
 */
function openInvoiceModal() {
    // Implementation for invoice modal
}

/**
 * فتح نافذة تفاصيل حساب العميل
 */
function openCustomerDetailsModal(customerId: string) {
    // Implementation for customer details modal
}

// ====================================================================
// 11. إضافة مستمعي الأحداث العامة (GLOBAL EVENT LISTENERS)
// ====================================================================
document.getElementById('confirm-reset-btn')!.addEventListener('click', async () => { await resetFactoryData(); closeModal('reset-confirm-modal'); });
emailSignInBtn.addEventListener('click', () => { const email = emailInput.value.trim(); const password = passwordInput.value.trim(); if (!email || !password) return showCustomMessage('الرجاء إدخال البريد الإلكتروني وكلمة المرور.', 'خطأ في الدخول'); signInWithEmailAndPassword(auth, email, password).catch(err => showCustomMessage(`فشل الدخول: ${err.message}`, 'خطأ في المصادقة')); });
emailSignUpBtn.addEventListener('click', async (e) => { if (!isRegistrationOpen) { showCustomMessage('التسجيل مغلق حالياً من قبل المسؤول.', 'تسجيل مغلق'); e.preventDefault(); return; } const email = emailInput.value.trim(); const password = passwordInput.value.trim(); if (!email || !password) return showCustomMessage('الرجاء إدخال البريد الإلكتروني وكلمة مرور (6 أحرف على الأقل).', 'خطأ في التسجيل'); createUserWithEmailAndPassword(auth, email, password).then(async (userCredential) => { await setupUserMetadata(userCredential.user.uid, email, true); }).catch(err => showCustomMessage(`فشل التسجيل: ${err.message}`, 'خطأ في التسجيل')); });
googleSignInBtn.addEventListener('click', async (e) => { if (!isRegistrationOpen) { showCustomMessage('التسجيل مغلق حالياً من قبل المسؤول.', 'تسجيل مغلق'); e.preventDefault(); return; } try { const result: any = await signInWithPopup(auth, new GoogleAuthProvider()); if (result.additionalUserInfo?.isNewUser) { await setupUserMetadata(result.user.uid, result.user.email, true); } } catch (err: any) { if (err.code !== 'auth/cancelled-popup-request') { showCustomMessage(`فشل الدخول: ${err.message}`, 'خطأ في المصادقة'); } } });
anonymousSignInBtn.addEventListener('click', () => signInAnonymously(auth).catch(err => { showCustomMessage(`فشل الدخول كزائر: ${err.message}`); }));
signOutBtn.addEventListener('click', () => signOut(auth).catch(err => showCustomMessage(`فشل الخروج: ${err.message}`)));

document.querySelectorAll('.nav-button').forEach((button) => {
  button.addEventListener('click', (e) => {
    const pageKey = (button as HTMLElement).dataset.page!;
    const pageKeyNormalized = pageKey.replace(/-/g, '_');
    const targetPageId = `${pageKey}-page`;

    if (userPermissions[pageKeyNormalized] === false) {
      return showPermissionDeniedMessage(pageKeyNormalized);
    }

    document.querySelectorAll('.page').forEach((page) => {
      page.classList.toggle('active', page.id === targetPageId);
    });

    document.querySelectorAll('.nav-button').forEach((btn) => btn.classList.remove('active'));
    (e.currentTarget as HTMLElement).classList.add('active');
  });
});
