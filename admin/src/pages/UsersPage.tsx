import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { getUsers, parseApiError, updateUser } from '../services/api';
import type { AdminUser, Plan } from '../types';

const validPlans: Plan[] = ['FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'];

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState<Plan | ''>('');
  const [status, setStatus] = useState<'active' | 'trial' | 'expired' | ''>('');
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const filters = useMemo(
    () => ({ page, limit: 20, search: search || undefined, plan: plan || undefined, status: status || undefined }),
    [page, search, plan, status]
  );

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await getUsers(filters);
        if (!mounted) {
          return;
        }

        setUsers(response.users);
        setTotalPages(response.pagination.totalPages || 1);
      } catch (err) {
        if (mounted) {
          setError(parseApiError(err));
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [filters]);

  const handlePromoteToggle = async (user: AdminUser) => {
    setPendingUserId(user.id);
    setError(null);

    try {
      await updateUser(user.id, { isAdmin: !user.isAdmin });
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, isAdmin: !item.isAdmin } : item))
      );
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setPendingUserId(null);
    }
  };

  return (
    <article className="panel">
      <h3>Users</h3>
      <p className="muted">Quick list. Open a user for full profile and generation history.</p>

      <div className="filters-row">
        <input
          placeholder="Search name or email"
          value={search}
          onChange={(event) => {
            setPage(1);
            setSearch(event.target.value);
          }}
        />

        <select
          value={plan}
          onChange={(event) => {
            setPage(1);
            setPlan(event.target.value as Plan | '');
          }}
        >
          <option value="">All plans</option>
          {validPlans.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value as 'active' | 'trial' | 'expired' | '');
          }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {isLoading ? <LoadingState label="Loading users..." /> : null}
      {error ? <ErrorState message={error} /> : null}

      {!isLoading && !error ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Admin</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>
                      <Link className="table-link" to={`/users/${user.id}`}>
                        {user.name || user.email}
                      </Link>
                    </td>
                    <td>{user.isAdmin ? 'Yes' : 'No'}</td>
                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <Link className="secondary-btn" to={`/users/${user.id}`}>
                          Open
                        </Link>
                        <button
                          className="secondary-btn"
                          type="button"
                          onClick={() => handlePromoteToggle(user)}
                          disabled={pendingUserId === user.id}
                        >
                          {user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pager-row">
            <button
              type="button"
              className="secondary-btn"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Prev
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              className="secondary-btn"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </article>
  );
}
