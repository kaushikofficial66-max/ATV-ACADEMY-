'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, HelpCircle, Lock, PlayCircle, ShieldCheck, Video } from 'lucide-react';
import { get } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Card, CardHeader } from '@/components/ui';
import { EmptyState, ErrorState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { learningKeys } from '@/features/learning/keys';
import { lockMessage } from '@/features/learning/LockedCourseTile';
import { useUnlockCourse } from '@/features/learning/useUnlockCourse';
import { formatDuration, formatPrice } from '@/lib/utils';

const TYPE_ICON = { video: PlayCircle, text: FileText, document: FileText, quiz: HelpCircle, live_class: Video };

/**
 * A course that belongs to a store plan the student has not bought: the full outline is visible but every
 * lecture is disabled. The student can unlock it on its own at the course fee (Razorpay) or look at the plans.
 */
export default function LockedCoursePage({ params }) {
  const { courseId } = use(params);
  const router = useRouter();
  const { unlock } = useUnlockCourse();
  const [busy, setBusy] = useState(null); // plan id being paid for
  const query = useQuery({ queryKey: learningKeys.lockedCourse(courseId), queryFn: () => get(EP.student.lockedCourse(courseId)).then((r) => r.data), retry: false });

  if (query.isPending) return <Loader />;
  if (query.isError) {
    const notFound = query.error?.response?.status === 404;
    return notFound ? (
      <Card>
        <EmptyState
          icon={Lock}
          title="This course is not available to unlock"
          description="You may already have it, or it is not part of a plan you can upgrade to."
          action={<Button href="/student/courses">Back to my courses</Button>}
        />
      </Card>
    ) : (
      <ErrorState error={query.error} onRetry={query.refetch} />
    );
  }

  const { course, sections, purchase } = query.data;
  const lectureTotal = sections.reduce((n, s) => n + s.lectures.length, 0);

  const onUnlock = async (planId) => {
    setBusy(planId);
    const ok = await unlock(course.id, planId);
    setBusy(null);
    if (ok) router.push(`/student/learn/${course.id}`);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <Link href="/student/courses" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden /> My courses
      </Link>

      {/* Hero: clearly locked */}
      <section className="rounded-2xl bg-gradient-to-br from-slate-700 via-slate-600 to-slate-500 p-5 text-white shadow-lg sm:rounded-3xl sm:p-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
          <Lock className="size-3.5" aria-hidden /> Locked
        </span>
        <h1 className="mt-3 text-xl font-bold leading-tight tracking-tight sm:text-3xl">{course.title}</h1>
        {course.short_description && <p className="mt-2 max-w-3xl text-sm text-white/80 sm:text-base">{course.short_description}</p>}
        <p className="mt-4 inline-flex items-start gap-2 rounded-xl bg-amber-400/20 px-3 py-2 text-sm font-medium text-amber-100">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {lockMessage(course.included_in)}. Your plan does not include this course yet.
          </span>
        </p>
        <p className="mt-3 text-xs text-white/70 sm:text-sm">
          {lectureTotal} lecture{lectureTotal === 1 ? '' : 's'} · {formatDuration(course.duration_seconds)}
        </p>
      </section>

      <div className="grid gap-5 sm:gap-6 lg:grid-cols-3">
        {/* Outline: every lecture visible, none openable */}
        <Card className="lg:col-span-2">
          <CardHeader title="What is inside" description="Unlock the course to open these lectures." />
          {!sections.length ? (
            <p className="px-5 py-6 text-sm text-slate-500">The lectures of this course will be listed here soon.</p>
          ) : (
            <ol>
              {sections.map((section, i) => (
                <li key={section.id} className="border-b border-slate-100 last:border-b-0">
                  <div className="px-4 py-3 sm:px-5">
                    <p className="text-[15px] font-semibold text-slate-800">Module {String(i + 1).padStart(2, '0')}</p>
                    <p className="text-[13px] text-slate-500">{section.title}</p>
                  </div>
                  <ul className="pb-2">
                    {section.lectures.map((l) => {
                      const Icon = TYPE_ICON[l.lecture_type] || FileText;
                      return (
                        <li key={l.id} data-locked="true" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-400 sm:px-5">
                          <Icon className="size-[18px] shrink-0" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{l.title}</span>
                          {l.duration_seconds ? <span className="shrink-0 text-xs tabular-nums">{formatDuration(l.duration_seconds)}</span> : null}
                          <Lock className="size-4 shrink-0" aria-label="Locked" />
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* Upgrade: pay the difference to the bigger plan */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <p className="text-sm font-medium text-slate-600">Unlock this course</p>
            <p className="mt-1 text-xs text-slate-500">
              {purchase.owned_plan ? `You have the ${purchase.owned_plan.name} plan, so you only pay the difference.` : 'Choose a plan that includes this course.'} One-time payment, incl. GST. Lifetime access.
            </p>

            <ul className="mt-4 space-y-3">
              {purchase.options.map((o) => (
                <li key={o.plan_id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-semibold text-slate-900">Upgrade to {o.name}</p>
                    <p className="text-xl font-bold text-slate-900">{o.price > 0 ? formatPrice(o.price) : '-'}</p>
                  </div>
                  {o.from_plan && o.full_price > o.price && (
                    <p className="text-xs text-slate-500">
                      <s>{formatPrice(o.full_price)}</s> minus your {o.from_plan.name} plan
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-600">Opens: {o.unlocks.map((u) => u.title).join(', ')}</p>
                  <Button className="mt-3 w-full" onClick={() => onUnlock(o.plan_id)} loading={busy === o.plan_id} disabled={!purchase.can_buy || Boolean(busy)}>
                    <Lock className="size-4" aria-hidden /> {purchase.can_buy ? `Pay ${formatPrice(o.price)}` : 'Not available'}
                  </Button>
                </li>
              ))}
            </ul>
            {!purchase.can_buy && purchase.reason && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{purchase.reason}</p>}

            <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              Secure payment by Razorpay (UPI, cards, net banking). You get access the moment the payment is confirmed.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
