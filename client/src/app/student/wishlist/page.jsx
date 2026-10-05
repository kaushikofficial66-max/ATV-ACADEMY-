'use client';

import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { get, post, del } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Card, PageHeader } from '@/components/ui';
import { QueryState, EmptyState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import CourseCard from '@/features/courses/CourseCard';

export default function WishlistPage() {
  const query = useQuery({ queryKey: ['student', 'wishlist'], queryFn: () => get(EP.student.wishlist).then((r) => r.data.wishlist) });
  const refresh = [['student', 'cart'], ['student', 'wishlist']];
  const remove = useApiMutation((courseId) => del(EP.student.wishlistItem(courseId)), { invalidate: refresh });
  const toCart = useApiMutation((courseId) => post(`${EP.student.wishlistItem(courseId)}/move-to-cart`), { invalidate: refresh });

  return (
    <>
      <PageHeader title="Wishlist" actions={<Button href="/student/cart" variant="secondary">Go to cart</Button>} />
      <QueryState query={query} loading={<Loader />}>
        {(items) =>
          items.length === 0 ? (
            <Card>
              <EmptyState title="Your wishlist is empty" action={<Button href="/courses">Browse courses</Button>} />
            </Card>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {items
                .filter((i) => i.course)
                .map((i) => (
                  <div key={i.id} className="flex flex-col gap-2">
                    <CourseCard course={i.course} />
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => toCart.mutate(i.course.id)}>
                        Move to cart
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => remove.mutate(i.course.id)} aria-label="Remove from wishlist">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )
        }
      </QueryState>
    </>
  );
}
