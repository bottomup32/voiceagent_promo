"use client";

import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export function AdminBreadcrumb() {
  const pathname = usePathname();
  const onCustomers = pathname.startsWith("/admin/customers");
  const onDetail = onCustomers && pathname !== "/admin/customers";

  return (
    <Breadcrumb>
      <BreadcrumbList className="ta-caption-1">
        <BreadcrumbItem>
          {onCustomers ? (
            <BreadcrumbLink href="/admin">Overview</BreadcrumbLink>
          ) : (
            <BreadcrumbPage>Overview</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {onCustomers ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {onDetail ? (
                <BreadcrumbLink href="/admin/customers">Customers</BreadcrumbLink>
              ) : (
                <BreadcrumbPage>Customers</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </>
        ) : null}
        {onDetail ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Detail</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
