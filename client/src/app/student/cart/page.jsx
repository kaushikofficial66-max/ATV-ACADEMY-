'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Heart, Trash2 } from 'lucide-react';
import { get, post, del, getErrorMessage } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Card, CardHeader, Input, PageHeader } from '@/components/ui';
import { QueryState, EmptyState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import { payWithRazorpay } from '@/features/commerce/razorpay';
import { assetUrl, formatPrice } from '@/lib/utils';

export default function CartPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const [paying, setPaying] = useState(false);

  const cartKey = ['student', 'cart', coupon];
  const query = useQuery({ queryKey: cartKey, queryFn: () => get(EP.student.cart, coupon ? { coupon_code: coupon } : undefined).then((r) => r.data.cart) });
  const refresh = [['student', 'cart'], ['student', 'wishlist']];

  const remove = useApiMutation((courseId) => del(EP.student.cartItem(courseId)), { invalidate: refresh });
  const toWishlist = useApiMutation((courseId) => post(`${EP.student.cartItem(courseId)}/move-to-wishlist`), { invalidate: refresh });
  const applyCoupon = useApiMutation((code) => post(EP.student.applyCoupon, { code }), {
    onSuccess: (_, code) => setCoupon(code)
  });

  const checkout = async () => {
    setPaying(true);
    try {
      const res = await post(EP.student.checkout, coupon ? { coupon_code: coupon } : {});
      if (!res.data.is_free) await payWithRazorpay(res.data.payment);
      toast.success('Payment successful! You are now enrolled.');
      queryClient.invalidateQueries({ queryKey: ['student'] });
      router.push('/student/courses');
    } catch (err) {
      if (err.dismissed) toast.info('Payment cancelled. You can retry from My orders.');
      else toast.error(getErrorMessage(err));
      queryClient.invalidateQueries({ queryKey: ['student', 'cart'] });
    } finally {
      setPaying(false);
    }
  };

  return (
    <>
      <PageHeader title="Cart" />
      <QueryState query={query} loading={<Loader />}>
        {(cart) =>
          cart.item_count === 0 ? (
            <Card>
              <EmptyState title="Your cart is empty" action={<Button href="/courses">Browse courses</Button>} />
            </Card>
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <ul className="divide-y divide-slate-100">
                  {cart.items.map((i) => (
                    <li key={i.id} className="flex gap-4 p-4">
                      <div className="aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        {i.course?.thumbnail_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={assetUrl(i.course.thumbnail_url)} alt="" className="size-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link href={`/courses/${i.course?.slug}`} className="font-medium text-slate-900 hover:text-brand-800">
                          {i.course?.title}
                        </Link>
                        {!i.available && <p className="text-xs text-red-600">No longer available</p>}
                        <div className="mt-2 flex gap-3 text-xs">
                          <button type="button" className="inline-flex items-center gap-1 text-slate-500 hover:text-red-600" onClick={() => remove.mutate(i.course_id)}>
                            <Trash2 className="size-3.5" aria-hidden /> Remove
                          </button>
                          <button type="button" className="inline-flex items-center gap-1 text-slate-500 hover:text-brand-700" onClick={() => toWishlist.mutate(i.course_id)}>
                            <Heart className="size-3.5" aria-hidden /> Move to wishlist
                          </button>
                        </div>
                      </div>
                      <p className="font-semibold text-slate-900">{formatPrice(i.price)}</p>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="h-fit">
                <CardHeader title="Summary" />
                <div className="space-y-3 p-5 text-sm">
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (couponInput.trim()) applyCoupon.mutate(couponInput.trim());
                    }}
                  >
                    <Input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="Coupon code" aria-label="Coupon code" />
                    <Button type="submit" variant="secondary" loading={applyCoupon.isPending}>
                      Apply
                    </Button>
                  </form>
                  {cart.coupon && (
                    <p className="flex justify-between text-green-700">
                      <span>Coupon {cart.coupon.code}</span>
                      <button type="button" className="text-xs underline" onClick={() => setCoupon('')}>
                        Remove
                      </button>
                    </p>
                  )}
                  <Line label="Subtotal" value={formatPrice(cart.subtotal)} />
                  {cart.discount_amount > 0 && <Line label="Discount" value={`- ${formatPrice(cart.discount_amount)}`} />}
                  {cart.tax_amount > 0 && <Line label={`Tax (${cart.tax_percent}%)`} value={formatPrice(cart.tax_amount)} />}
                  <div className="border-t border-slate-100 pt-3">
                    <Line label={<span className="font-semibold text-slate-900">Total</span>} value={<span className="text-lg font-semibold">{formatPrice(cart.total_amount)}</span>} />
                  </div>
                  <Button className="w-full" size="lg" loading={paying} onClick={checkout}>
                    {Number(cart.total_amount) === 0 ? 'Enroll for free' : 'Checkout'}
                  </Button>
                </div>
              </Card>
            </div>
          )
        }
      </QueryState>
    </>
  );
}

function Line({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span>{value}</span>
    </div>
  );
}
