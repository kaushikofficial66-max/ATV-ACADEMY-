'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, Clock, CircleAlert } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { Loader, Spinner } from '@/components/feedback/Loader';
import { useAuth } from '@/features/auth/AuthProvider';
import { get } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';

const POLL_MS = 4000;
const GIVE_UP_MS = 3 * 60 * 1000;

/**
 * Landing page after the WooCommerce thank-you page
 * (/purchase-complete?order=<WooCommerce order id>). Access is granted only
 * when the server has verified the order with WooCommerce (webhook or REST
 * pull) - reaching this URL proves nothing, so the page just waits and polls.
 */
export default function PurchaseComplete() {
  const params = useSearchParams();
  const raw = params.get('order') || '';
  const orderId = /^\d+$/.test(raw) ? raw : null;
  const { isAuthenticated, role, status: authStatus } = useAuth();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setGaveUp(true), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, []);

  const query = useQuery({
    queryKey: ['student', 'store-purchase', orderId],
    queryFn: () => get(EP.student.storePurchase(orderId)).then((r) => r.data),
    enabled: Boolean(orderId) && isAuthenticated && role === 'student',
    refetchInterval: (q) => (q.state.data?.status === 'paid' || gaveUp ? false : POLL_MS)
  });

  const loginHref = `/login?next=${encodeURIComponent(`/purchase-complete${orderId ? `?order=${orderId}` : ''}`)}`;

  if (authStatus === 'loading') return <Loader />;

  if (!isAuthenticated) {
    return (
      <Panel icon={CircleCheck} tone="green" title="Thank you for your purchase!">
        <p>Log in to start learning. Your course is added to your account automatically once the payment is confirmed.</p>
        <p>
          New here? We created an account with the email you used at checkout and sent you a link to set your password (check your spam folder too).
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button href={loginHref}>Log in</Button>
          <Button href="/forgot-password" variant="secondary">
            Didn&apos;t get the email?
          </Button>
        </div>
      </Panel>
    );
  }

  if (role !== 'student') {
    return (
      <Panel icon={CircleAlert} tone="amber" title="Purchases belong to student accounts">
        <p>Log in with the student account (the email used at checkout) to see this purchase.</p>
      </Panel>
    );
  }

  if (!orderId) {
    return (
      <Panel icon={CircleCheck} tone="green" title="Thank you for your purchase!">
        <p>Your course appears in My Courses as soon as the payment is confirmed - usually within a minute.</p>
        <Button href="/student/courses">Go to My Courses</Button>
      </Panel>
    );
  }

  const data = query.data;
  const status = data?.status || 'processing';

  if (status === 'paid') {
    return (
      <Panel icon={CircleCheck} tone="green" title="You're enrolled!">
        <p>Payment confirmed for order {data.order.order_number}. Your course{data.order.courses.length > 1 ? 's are' : ' is'} ready:</p>
        <ul className="space-y-2">
          {data.order.courses.map((c) => (
            <li key={c.id}>
              <Button href={`/student/learn/${c.id}`} variant="secondary" className="w-full justify-between">
                {c.title} <span aria-hidden>→</span>
              </Button>
            </li>
          ))}
        </ul>
        <Button href="/student/courses" variant="link">
          Go to My Courses
        </Button>
      </Panel>
    );
  }

  if (['refunded', 'cancelled', 'failed'].includes(status)) {
    return (
      <Panel icon={CircleAlert} tone="red" title={`This order is ${status}`}>
        <p>Order #{orderId} is {status} on the store, so it does not give access to a course. If you think this is a mistake, please contact support.</p>
      </Panel>
    );
  }

  if (status === 'pending') {
    return (
      <Panel icon={Clock} tone="amber" title="Waiting for payment">
        <p>Order #{orderId} is awaiting payment on the store (for example a bank transfer). Your course is unlocked automatically once the payment is received.</p>
      </Panel>
    );
  }

  const slow = gaveUp && !query.isFetching;
  return (
    <Panel icon={slow ? CircleAlert : Clock} tone="amber" title={slow ? 'This is taking longer than usual' : 'Your payment is being verified'}>
      {slow ? (
        <>
          <p>We have not received confirmation for order #{orderId} yet. It will appear in My Courses automatically as soon as it is confirmed.</p>
          <p>Used a different email address at checkout? Log out and log in with that email. Still stuck? Contact support with your order number.</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={() => query.refetch()}>Check again</Button>
            <Button href="/student/courses" variant="secondary">
              Go to My Courses
            </Button>
          </div>
        </>
      ) : (
        <p className="flex items-center gap-2">
          <Spinner className="size-4" /> Confirming order #{orderId} with the store. This usually takes less than a minute - you can keep this page open.
        </p>
      )}
    </Panel>
  );
}

const TONES = { green: 'text-green-600', amber: 'text-amber-600', red: 'text-red-600' };

function Panel({ icon: Icon, tone, title, children }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <Card className="space-y-4 p-8 text-sm leading-6 text-slate-600">
        <Icon className={`size-10 ${TONES[tone]}`} aria-hidden />
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {children}
      </Card>
    </div>
  );
}
