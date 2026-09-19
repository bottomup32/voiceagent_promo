import { AppSidebar } from "@/components/admin/AppSidebar";
import { ModeToggle } from "@/components/admin/ModeToggle";
import { AdminBreadcrumb } from "@/components/admin/AdminBreadcrumb";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="bg-background sticky top-0 z-10 flex h-14 items-center gap-3 border-b px-4">
          <SidebarTrigger aria-label="Toggle the sidebar" />
          <AdminBreadcrumb />
          <div className="ml-auto flex items-center gap-1">
            <ModeToggle />
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
