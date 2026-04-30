import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { getUserProfile, parseApiError } from '../services/api';
import type { AdminUserProfileResponse } from '../types';

const historyOptions = [10, 25, 50, 100] as const;

function formatDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString();
}

function truncateText(value: string, maxLength = 180): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const [data, setData] = useState<AdminUserProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState<number>(25);

  useEffect(() => {
    if (!userId) {
      setError('User id is missing');
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const run = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await getUserProfile(userId, historyLimit);
        if (!mounted) {
          return;
        }
        setData(response);
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
  }, [userId, historyLimit]);

  if (isLoading) {
    return <LoadingState label="Loading user profile..." />;
  }
  if (error) {
    return <ErrorState message={error} />;
  }
  if (!data) {
    return <ErrorState message="No user data available" />;
  }

  const { user, usage, latestGenerations } = data;

  return (
    <div className="stack-lg">
      <article className="panel">
        <div className="panel-header-row">
          <h3>User Profile</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <select value={historyLimit} onChange={(event) => setHistoryLimit(Number(event.target.value))}>
              {historyOptions.map((item) => (
                <option key={item} value={item}>
                  Last {item}
                </option>
              ))}
            </select>
            <Link className="secondary-btn" to="/users">
              Back to users
            </Link>
          </div>
        </div>
        <p className="muted">Per-user history, usage volume, and latest generated outputs.</p>

        <div className="kv-grid profile-kv-grid" style={{ marginTop: '14px' }}>
          <p>Name</p>
          <p>{user.name || '-'}</p>
          <p>Email</p>
          <p>{user.email}</p>
          <p>Plan</p>
          <p>{user.plan}</p>
          <p>Email Verified</p>
          <p>{user.isEmailVerified ? 'Yes' : 'No'}</p>
          <p>Admin</p>
          <p>{user.isAdmin ? 'Yes' : 'No'}</p>
          <p>Created</p>
          <p>{new Date(user.createdAt).toLocaleString()}</p>
          <p>Trial Ends</p>
          <p>{formatDateTime(user.trialEndsAt)}</p>
          <p>Plan Expires</p>
          <p>{formatDateTime(user.planExpiresAt)}</p>
          <p>Last Login</p>
          <p>{formatDateTime(user.lastLoginAt)}</p>
          <p>Last Idea</p>
          <p>{formatDateTime(user.lastIdeaGeneratedAt)}</p>
          <p>Last Payment</p>
          <p>{formatDateTime(user.lastPaymentAt)}</p>
        </div>
      </article>

      <article className="panel">
        <h3>Usage Totals</h3>
        <div className="kv-grid profile-kv-grid" style={{ marginTop: '12px' }}>
          <p>Ideas</p>
          <p>{usage.ideasTotal}</p>
          <p>Feedback</p>
          <p>{usage.feedbacksTotal}</p>
          <p>Emails</p>
          <p>{usage.emailsTotal}</p>
          <p>Nutrition</p>
          <p>{usage.nutritionTotal}</p>
          <p>Idea Structures</p>
          <p>{usage.ideaStructuresTotal}</p>
          <p>Chat Messages</p>
          <p>{usage.chatMessagesTotal}</p>
          <p>Calendar Entries</p>
          <p>{usage.calendarEntriesTotal}</p>
        </div>
      </article>

      <article className="panel">
        <h3>Usage This Month</h3>
        <div className="kv-grid profile-kv-grid" style={{ marginTop: '12px' }}>
          <p>Ideas</p>
          <p>{usage.ideasThisMonth}</p>
          <p>Feedback</p>
          <p>{usage.feedbacksThisMonth}</p>
          <p>Emails</p>
          <p>{usage.emailsThisMonth}</p>
          <p>Nutrition</p>
          <p>{usage.nutritionThisMonth}</p>
          <p>Idea Structures</p>
          <p>{usage.ideaStructuresThisMonth}</p>
          <p>Chat Messages</p>
          <p>{usage.chatMessagesThisMonth}</p>
          <p>Calendar Entries</p>
          <p>{usage.calendarEntriesThisMonth}</p>
        </div>
      </article>

      <article className="panel">
        <h3>Latest Ideas</h3>
        {latestGenerations.ideas.length === 0 ? (
          <p className="muted">No ideas generated yet.</p>
        ) : (
          <ul className="line-list" style={{ marginTop: '12px' }}>
            {latestGenerations.ideas.map((idea) => (
              <li key={idea.id}>
                <strong>{idea.format}</strong> - {truncateText(idea.hook)}
                <div className="muted" style={{ marginTop: '6px' }}>
                  {idea.objective} | {new Date(idea.createdAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="panel">
        <h3>Latest Tool Generations (Last {historyLimit})</h3>

        <div style={{ marginTop: '12px' }}>
          <p className="muted" style={{ marginBottom: '8px' }}>
            Content Review
          </p>
          {latestGenerations.feedbacks.length === 0 ? (
            <p className="muted">No content reviews yet.</p>
          ) : (
            <ul className="line-list">
              {latestGenerations.feedbacks.map((feedback) => (
                <li key={feedback.id}>
                  <strong>{feedback.fileType}</strong> ({feedback.fileName}) - score {feedback.overallScore}
                  <div className="muted" style={{ marginTop: '6px' }}>
                    {truncateText(feedback.summary)} | {new Date(feedback.createdAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ marginTop: '16px' }}>
          <p className="muted" style={{ marginBottom: '8px' }}>
            Email Marketing
          </p>
          {latestGenerations.emails.length === 0 ? (
            <p className="muted">No email generations yet.</p>
          ) : (
            <ul className="line-list">
              {latestGenerations.emails.map((email) => (
                <li key={email.id}>
                  {email.topic} ({email.objective}, {email.emailType}, {email.tone}, {email.language})
                  <div className="muted" style={{ marginTop: '6px' }}>
                    {new Date(email.createdAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ marginTop: '16px' }}>
          <p className="muted" style={{ marginBottom: '8px' }}>
            Nutrition
          </p>
          {latestGenerations.nutritionPlans.length === 0 ? (
            <p className="muted">No nutrition generations yet.</p>
          ) : (
            <ul className="line-list">
              {latestGenerations.nutritionPlans.map((plan) => (
                <li key={plan.id}>
                  {plan.calories} kcal | P {plan.proteinGrams}g | F {plan.fatGrams}g | C {plan.carbsGrams}g |{' '}
                  {plan.mealsPerDay} meals
                  <div className="muted" style={{ marginTop: '6px' }}>
                    {new Date(plan.createdAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ marginTop: '16px' }}>
          <p className="muted" style={{ marginBottom: '8px' }}>
            Idea Structurer
          </p>
          {latestGenerations.ideaStructures.length === 0 ? (
            <p className="muted">No idea structures yet.</p>
          ) : (
            <ul className="line-list">
              {latestGenerations.ideaStructures.map((item) => (
                <li key={item.id}>
                  {truncateText(item.ideaText)}
                  <div className="muted" style={{ marginTop: '6px' }}>
                    {new Date(item.createdAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ marginTop: '16px' }}>
          <p className="muted" style={{ marginBottom: '8px' }}>
            Chat
          </p>
          {latestGenerations.chatMessages.length === 0 ? (
            <p className="muted">No chat usage yet.</p>
          ) : (
            <ul className="line-list">
              {latestGenerations.chatMessages.map((item) => (
                <li key={item.id}>
                  {truncateText(item.message)}
                  <div className="muted" style={{ marginTop: '6px' }}>
                    {new Date(item.createdAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ marginTop: '16px' }}>
          <p className="muted" style={{ marginBottom: '8px' }}>
            Calendar
          </p>
          {latestGenerations.calendarEntries.length === 0 ? (
            <p className="muted">No calendar entries yet.</p>
          ) : (
            <ul className="line-list">
              {latestGenerations.calendarEntries.map((item) => (
                <li key={item.id}>
                  {item.title} ({item.format} - {item.status})
                  <div className="muted" style={{ marginTop: '6px' }}>
                    Planned: {new Date(item.date).toLocaleDateString()} | Added:{' '}
                    {new Date(item.createdAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>
    </div>
  );
}
