import { Injectable, signal, computed, effect } from '@angular/core';
import { Firestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

export type UserRole = 'admin' | 'cashier';

export interface CashierAccount {
  username: string;
  pin: string;
  role: UserRole;
  isApproved: boolean;
  createdAt?: string;
}

const SESSION_STORAGE_KEY = 'maranth_auth_session';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Writable internal state
  private _registeredCashiers = signal<CashierAccount[]>([]);
  private _currentCashier = signal<string | null>(null);
  private _currentRole = signal<UserRole | null>(null);
  private _isCashiersLoaded = signal<boolean>(false);

  // Public read-only signals for components & guards
  public readonly registeredCashiers = this._registeredCashiers.asReadonly();
  public readonly currentCashier = this._currentCashier.asReadonly();
  public readonly currentRole = this._currentRole.asReadonly();
  public readonly isCashiersLoaded = this._isCashiersLoaded.asReadonly();

  public readonly isAuthenticated = computed(() => Boolean(this._currentCashier()));
  public readonly isAdmin = computed(() => this._currentRole() === 'admin');

  private db: Firestore | null = null;
  private unsubscribeCashiers: (() => void) | null = null;

  constructor() {
    this.restoreSession();

    // Sync active session to localStorage automatically
    effect(() => {
      if (typeof localStorage === 'undefined') return;
      const username = this._currentCashier();
      const role = this._currentRole();
      if (username && role) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ username, role }));
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    });
  }

  /**
   * Attaches the Firestore instance from SalesService and starts real-time staff sync.
   */
  public bindFirestore(db: Firestore): void {
    this.db = db;
    if (this.unsubscribeCashiers) {
      this.unsubscribeCashiers();
    }

    this.unsubscribeCashiers = onSnapshot(collection(db, 'cashiers'), snapshot => {
      const list: CashierAccount[] = snapshot.docs.map(d => {
        const data = d.data() as CashierAccount;
        return {
          username: data.username || d.id,
          pin: String(data.pin ?? ''),
          role: data.role === 'admin' ? 'admin' : 'cashier',
          isApproved: Boolean(data.isApproved),
          createdAt: data.createdAt
        };
      });

      this._registeredCashiers.set(list);
      this._isCashiersLoaded.set(true);

      // Immediately revoke active session if an admin disables the logged-in cashier
      const activeUser = this._currentCashier();
      if (activeUser && list.length > 0) {
        const record = list.find(c => c.username.toLowerCase() === activeUser.toLowerCase());
        if (record && !record.isApproved) {
          this.logoutCashier();
        } else if (record && record.role !== this._currentRole()) {
          this._currentRole.set(record.role);
        }
      }
    });
  }

  /**
   * Validates username + PIN and establishes an active shift session.
   */
  public loginWithPin(username: string, pin: string): { success: boolean; error?: string } {
    const cleanUser = (username || '').trim().toLowerCase();
    const cleanPin = String(pin ?? '').trim();

    if (!cleanUser || !cleanPin) {
      return { success: false, error: 'Please enter both username and PIN.' };
    }

    const account = this._registeredCashiers().find(
      c => c.username.trim().toLowerCase() === cleanUser
    );

    if (!account) {
      return { success: false, error: 'User account not found.' };
    }

    if (String(account.pin).trim() !== cleanPin) {
      return { success: false, error: 'Invalid PIN.' };
    }

    if (!account.isApproved) {
      return { success: false, error: 'Account access is pending admin approval or revoked.' };
    }

    this._currentCashier.set(account.username);
    this._currentRole.set(account.role);
    return { success: true };
  }

  /**
   * Registers a new cashier or admin account in Firestore.
   */
  public async registerNewCashier(
    username: string,
    pin: string,
    role: UserRole = 'cashier',
    autoApprove = false
  ): Promise<{ success: boolean; error?: string }> {
    const cleanUser = (username || '').trim();
    const cleanPin = String(pin ?? '').trim();

    if (!cleanUser || cleanPin.length < 4) {
      return { success: false, error: 'Username and a PIN of at least 4 digits are required.' };
    }

    const exists = this._registeredCashiers().some(
      c => c.username.trim().toLowerCase() === cleanUser.toLowerCase()
    );
    if (exists) {
      return { success: false, error: 'Username already exists.' };
    }

    // Only auto-approve the very first account if cashiers have finished loading
    const isFirstAccount = this._isCashiersLoaded() && this._registeredCashiers().length === 0;
    const newAccount: CashierAccount = {
      username: cleanUser,
      pin: cleanPin,
      role: isFirstAccount ? 'admin' : role,
      isApproved: isFirstAccount || autoApprove,
      createdAt: new Date().toISOString()
    };

    this._registeredCashiers.update(list => [...list, newAccount]);

    if (this.db) {
      await setDoc(doc(this.db, 'cashiers', cleanUser), newAccount);
    }

    return { success: true };
  }

  /**
   * Toggles active login permission for a staff member (used in Inventory -> Staff tab).
   */
  public async toggleCashierApproval(username: string, isApproved: boolean): Promise<void> {
    this._registeredCashiers.update(list =>
      list.map(c => (c.username === username ? { ...c, isApproved } : c))
    );

    if (this.db) {
      await setDoc(doc(this.db, 'cashiers', username), { isApproved }, { merge: true });
    }
  }

  /**
   * Clears the current cashier session.
   */
  public logoutCashier(): void {
    this._currentCashier.set(null);
    this._currentRole.set(null);
  }

  private restoreSession(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.username && (parsed?.role === 'admin' || parsed?.role === 'cashier')) {
        this._currentCashier.set(parsed.username);
        this._currentRole.set(parsed.role);
      }
    } catch {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }

  public setSession(username: string, role: UserRole): void {
    this._currentCashier.set(username);
    this._currentRole.set(role);
  }
}