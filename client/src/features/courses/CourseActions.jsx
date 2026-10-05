'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { get, post, del, getErrorMessage } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';

/**
 * Buy / wishlist / continue buttons on the public course page. The page is
 * server-rendered for SEO; viewer-specific state is loaded here in the browser.
 */
export default function CourseActions({ courseId, slug }) {
  const { isAuthenticated, role } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const viewerQuery = useQuery({
    queryKey: ['course-viewer', slug],
    queryFn: () => get(EP.public.course(slug)).then((r) => r.data.viewer),
    enabled: isAuthenticated
  });
  const viewer = viewerQuery.data;

  const addToCart = useMutation({
    mutationFn: () => post(EP.student.cart, { course_id: courseId }),
    onSuccess: () => router.push('/student/cart'),
    onError: (e) => toast.error(getErrorMessage(e))
  });
  const toggleWishlist = useMutation({
    mutationFn: () => (viewer?.in_wishlist ? del(EP.student.wishlistItem(courseId)) : post(EP.student.wishlist, { course_id: courseId })),
    onSuccess: (res) => {
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ['course-viewer', slug] });
    },
    onError: (e) => toast.error(getErrorMessage(e))
  });

  if (!isAuthenticated) {
    return (
      <Button href={`/login?next=/courses/${slug}`} className="mt-4 w-full" size="lg">
        Log in to enroll
      </Button>
    );
  }
  if (viewer?.is_enrolled || viewer?.can_manage) {
    return (
      <Button href={role === 'student' ? `/student/learn/${courseId}` : `/${role}/courses/${courseId}`} className="mt-4 w-full" size="lg">
        {viewer.is_enrolled ? 'Go to course' : 'Manage course'}
      </Button>
    );
  }
  if (role !== 'student') return <p className="mt-4 text-sm text-slate-500">Log in with a student account to enroll.</p>;

  return (
    <div className="mt-4 flex gap-2">
      <Button className="flex-1" size="lg" loading={addToCart.isPending} onClick={() => (viewer?.in_cart ? router.push('/student/cart') : addToCart.mutate())}>
        {viewer?.in_cart ? 'Go to cart' : 'Add to cart'}
      </Button>
      <Button variant="secondary" size="lg" aria-label="Wishlist" loading={toggleWishlist.isPending} onClick={() => toggleWishlist.mutate()}>
        <Heart className={viewer?.in_wishlist ? 'size-5 fill-red-500 text-red-500' : 'size-5'} />
      </Button>
    </div>
  );
}
