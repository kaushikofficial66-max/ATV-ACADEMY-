import {
  Eye,
  LayoutDashboard,
  BookOpen,
  PlayCircle,
  ClipboardCheck,
  FolderUp,
  Video,
  Award,
  Users,
  Receipt,
  Star,
  Bell,
  UserCog,
  GraduationCap,
  Wallet,
  Tags,
  UserCheck,
  CreditCard,
  TicketPercent,
  Banknote,
  MessageSquare,
  Megaphone,
  FileBarChart,
  FileText,
  Settings,
  ShieldCheck,
  ListChecks
} from 'lucide-react';

/**
 * Sidebar menus per role. `section` groups items under a heading.
 * `hideInStoreMode` items are hidden while WooCommerce handles purchases.
 */
export const NAVIGATION = {
  student: [
    { label: 'Home', href: '/student', icon: LayoutDashboard },
    { label: 'My Courses', href: '/student/courses', icon: BookOpen },
    { label: 'Live Classes', href: '/student/live-classes', icon: Video },
    { label: 'Projects', href: '/student/projects', icon: FolderUp },
    { label: 'Certificates', href: '/student/certificates', icon: Award },
    { label: 'Community', href: '/student/community', icon: Users },
    { section: 'Account' },
    { label: 'My Purchases', href: '/student/orders', icon: Receipt },
    { label: 'Notifications', href: '/student/notifications', icon: Bell },
    { label: 'Profile & password', href: '/student/account', icon: UserCog }
  ],
  tutor: [
    { label: 'Dashboard', href: '/tutor', icon: LayoutDashboard },
    { label: 'Courses', href: '/tutor/courses', icon: BookOpen },
    { label: 'Project Reviews', href: '/tutor/submissions', icon: ClipboardCheck },
    { label: 'Students', href: '/tutor/students', icon: GraduationCap },
    { label: 'Live Classes', href: '/tutor/live-classes', icon: Video },
    { label: 'Certificates', href: '/tutor/certificates', icon: Award },
    { label: 'Reviews', href: '/tutor/reviews', icon: Star },
    { label: 'Earnings', href: '/tutor/earnings', icon: Wallet },
    { section: 'Account' },
    { label: 'Notifications', href: '/tutor/notifications', icon: Bell },
    { label: 'Account', href: '/tutor/account', icon: UserCog }
  ],
  admin: [
    { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { section: 'People' },
    { label: 'Students', href: '/admin/students', icon: GraduationCap },
    { label: 'Tutors', href: '/admin/tutors', icon: UserCheck },
    { label: 'Users', href: '/admin/users', icon: Users },
    { section: 'Preview' },
    { label: 'View as Student', href: '/admin/view-as/student', icon: Eye },
    { label: 'View as Tutor', href: '/admin/view-as/tutor', icon: Eye },
    { section: 'Learning' },
    { label: 'Courses', href: '/admin/courses', icon: BookOpen },
    { label: 'Categories', href: '/admin/categories', icon: Tags },
    { label: 'Enrollments', href: '/admin/enrollments', icon: ListChecks },
    { label: 'Project Approvals', href: '/admin/submissions', icon: ClipboardCheck },
    { label: 'Certificates', href: '/admin/certificates', icon: Award },
    { label: 'Live Classes', href: '/admin/live-classes', icon: PlayCircle },
    { section: 'Sales' },
    { label: 'Orders', href: '/admin/orders', icon: Receipt },
    { label: 'Payments', href: '/admin/payments', icon: CreditCard },
    { label: 'Coupons', href: '/admin/coupons', icon: TicketPercent, hideInStoreMode: true },
    { label: 'Tutor Payouts', href: '/admin/payouts', icon: Banknote },
    { section: 'Engagement' },
    { label: 'Community', href: '/admin/community', icon: MessageSquare },
    { label: 'Reviews', href: '/admin/reviews', icon: Star },
    { label: 'Communications', href: '/admin/communications', icon: Megaphone },
    { label: 'Notifications', href: '/admin/notifications', icon: Bell },
    { section: 'System' },
    { label: 'Reports', href: '/admin/reports', icon: FileBarChart },
    { label: 'Website (CMS)', href: '/admin/cms', icon: FileText },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
    { label: 'Account', href: '/admin/account', icon: ShieldCheck }
  ]
};

/**
 * Phone bottom bar: the four most-used pages per role; everything else is under "More".
 */
export const MOBILE_TABS = {
  student: [
    { label: 'Home', href: '/student', icon: LayoutDashboard },
    { label: 'Courses', href: '/student/courses', icon: BookOpen },
    { label: 'Live', href: '/student/live-classes', icon: Video },
    { label: 'Certificates', href: '/student/certificates', icon: Award }
  ],
  tutor: [
    { label: 'Home', href: '/tutor', icon: LayoutDashboard },
    { label: 'Courses', href: '/tutor/courses', icon: BookOpen },
    { label: 'Students', href: '/tutor/students', icon: GraduationCap },
    { label: 'Live', href: '/tutor/live-classes', icon: Video }
  ],
  admin: [
    { label: 'Home', href: '/admin', icon: LayoutDashboard },
    { label: 'Courses', href: '/admin/courses', icon: BookOpen },
    { label: 'Students', href: '/admin/students', icon: GraduationCap },
    { label: 'Orders', href: '/admin/orders', icon: Receipt }
  ]
};
