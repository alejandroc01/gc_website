import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAdminSession } from '../components/AdminAuth/AdminAuthGate.jsx';
import {
  createAdminAccount,
  deleteAdminAccount,
  getAdminAccounts,
  updateAdminAccount,
} from '../api/composites.js';
import '../styles/composites.css';

const adminRoles = ['Owner', 'Administrator'];
const initialCreateValues = {
  username: '',
  password: '',
  role: 'Administrator',
};

export default function AdminAccountsPage() {
  const { admin, setAdmin } = useAdminSession();
  const [accounts, setAccounts] = useState([]);
  const [createValues, setCreateValues] = useState(initialCreateValues);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusError, setStatusError] = useState('');

  const isOwner = admin?.role === 'Owner';

  useEffect(() => {
    let isActive = true;

    const loadAccounts = async () => {
      setIsLoading(true);
      setStatusError('');

      try {
        const payload = await getAdminAccounts();

        if (isActive) {
          setAccounts(payload.accounts || []);
        }
      } catch (error) {
        if (isActive) {
          setStatusError(error.message);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadAccounts();

    return () => {
      isActive = false;
    };
  }, []);

  const handleCreateChange = (event) => {
    const { name, value } = event.target;

    setCreateValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
    setStatusError('');
    setStatusMessage('');
  };

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    setIsCreating(true);
    setStatusError('');
    setStatusMessage('');

    try {
      const payload = await createAdminAccount(createValues);
      setAccounts((currentAccounts) => [...currentAccounts, payload.account]);
      setCreateValues(initialCreateValues);
      setStatusMessage(`Created admin account ${payload.account.username}.`);
    } catch (error) {
      setStatusError(error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleAccountSaved = (savedAccount) => {
    setAccounts((currentAccounts) => currentAccounts.map((account) => (
      account.id === savedAccount.id ? savedAccount : account
    )));

    if (savedAccount.id === admin.id) {
      setAdmin(savedAccount);
    }
  };

  const handleAccountDeleted = (deletedAccount) => {
    setAccounts((currentAccounts) => currentAccounts.filter((account) => account.id !== deletedAccount.id));
  };

  return (
    <section className="section compositeAdmin">
      <div className="container">
        <div className="compositePageHeader">
          <p className="compositePageHeader__eyebrow">Admin Tools</p>
          <h1 className="compositePageHeader__title">Admin Accounts</h1>
          <p className="compositePageHeader__description">
            Owners can create accounts, assign roles, and manage passwords. Administrators can update only their own password.
          </p>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <Link className="button compositeButton" to="/upload">
            Back to Admin Tools
          </Link>
        </div>

        {isOwner ? (
          <article className="compositePanel compositePanel--spacious">
            <div className="compositePanel__header">
              <div>
                <h2 className="compositePanel__title">Create Admin Account</h2>
              </div>
            </div>

            <form className="adminAccountForm" onSubmit={handleCreateSubmit}>
              <label className="compositeField">
                <span className="compositeField__label">Username</span>
                <input
                  className="compositeField__input"
                  name="username"
                  type="text"
                  autoComplete="off"
                  value={createValues.username}
                  onChange={handleCreateChange}
                />
              </label>

              <label className="compositeField">
                <span className="compositeField__label">Password</span>
                <input
                  className="compositeField__input"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={createValues.password}
                  onChange={handleCreateChange}
                />
              </label>

              <label className="compositeField">
                <span className="compositeField__label">Role</span>
                <select
                  className="compositeField__input"
                  name="role"
                  value={createValues.role}
                  onChange={handleCreateChange}
                >
                  {adminRoles.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </label>

              <div className="adminAccountForm__actions">
                <button
                  type="submit"
                  className="button compositeButton compositeButton--filled"
                  disabled={isCreating}
                >
                  {isCreating ? 'Creating Account...' : 'Create Account'}
                </button>
              </div>
            </form>
          </article>
        ) : null}

        <article className="compositePanel compositePanel--spacious">
          <div className="compositePanel__header">
            <div>
              <h2 className="compositePanel__title">Manage Accounts</h2>
              {!isOwner ? (
                <p className="compositePanel__description">
                  Your Administrator role can change this account password.
                </p>
              ) : null}
            </div>
          </div>

          {isLoading ? <p className="compositeMessage">Loading admin accounts...</p> : null}
          {statusMessage ? <p className="compositeMessage compositeMessage--success">{statusMessage}</p> : null}
          {statusError ? <p className="compositeMessage compositeMessage--error">{statusError}</p> : null}

          <div className="adminAccountList">
            {accounts.map((account) => (
              <AdminAccountRow
                key={account.id}
                account={account}
                currentAdmin={admin}
                isOwner={isOwner}
                onSaved={handleAccountSaved}
                onDeleted={handleAccountDeleted}
              />
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function AdminAccountRow({
  account,
  currentAdmin,
  isOwner,
  onSaved,
  onDeleted,
}) {
  const [values, setValues] = useState(() => buildRowValues(account));
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [rowMessage, setRowMessage] = useState('');
  const [rowError, setRowError] = useState('');

  const isSelf = account.id === currentAdmin.id;

  useEffect(() => {
    setValues(buildRowValues(account));
  }, [account]);

  const handleValueChange = (event) => {
    const { name, value } = event.target;

    setValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
    setRowMessage('');
    setRowError('');
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setRowMessage('');
    setRowError('');

    try {
      const updates = isOwner
        ? {
          username: values.username,
          role: values.role,
          ...(values.password ? { password: values.password } : {}),
        }
        : { password: values.password };

      if (!isOwner && !values.password) {
        throw new Error('Enter a new password before saving.');
      }

      const payload = await updateAdminAccount(account.id, updates);
      onSaved(payload.account);
      setValues((currentValues) => ({ ...currentValues, password: '' }));
      setRowMessage(`Saved ${payload.account.username}.`);
    } catch (error) {
      setRowError(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setRowMessage('');
    setRowError('');

    try {
      const payload = await deleteAdminAccount(account.id);
      onDeleted(payload.account);
    } catch (error) {
      setRowError(error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <form className="adminAccountCard" onSubmit={handleSave}>
      <div className="adminAccountCard__header">
        <div>
          <h3 className="adminAccountCard__title">{account.username}</h3>
          <p className="adminAccountCard__meta">
            {account.role}{isSelf ? ' · Current account' : ''}
          </p>
        </div>
      </div>

      <div className="adminAccountCard__grid">
        <label className="compositeField">
          <span className="compositeField__label">Username</span>
          <input
            className="compositeField__input"
            name="username"
            type="text"
            value={values.username}
            onChange={handleValueChange}
            disabled={!isOwner}
          />
        </label>

        <label className="compositeField">
          <span className="compositeField__label">Role</span>
          <select
            className="compositeField__input"
            name="role"
            value={values.role}
            onChange={handleValueChange}
            disabled={!isOwner}
          >
            {adminRoles.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </label>

        <label className="compositeField">
          <span className="compositeField__label">New Password</span>
          <input
            className="compositeField__input"
            name="password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={handleValueChange}
            placeholder="Leave blank to keep current password"
          />
        </label>
      </div>

      <div className="adminAccountCard__actions">
        <button type="submit" className="button compositeButton compositeButton--filled" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Account'}
        </button>
        {isOwner && !isSelf ? (
          <button
            type="button"
            className="button compositeButton compositeButton--danger"
            disabled={isDeleting}
            onClick={handleDelete}
          >
            {isDeleting ? 'Deleting...' : 'Delete Account'}
          </button>
        ) : null}
      </div>

      {rowMessage ? <p className="compositeMessage compositeMessage--success">{rowMessage}</p> : null}
      {rowError ? <p className="compositeMessage compositeMessage--error">{rowError}</p> : null}
    </form>
  );
}

function buildRowValues(account) {
  return {
    username: account.username,
    role: account.role,
    password: '',
  };
}
