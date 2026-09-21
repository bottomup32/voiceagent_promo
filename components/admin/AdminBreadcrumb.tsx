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
  const onCrm = pathname.startsWith("/admin/crm");
  const nested = onCustomers || onCrm;

  return (
    <Breadcrumb>
      <BreadcrumbList className="ta-caption-1">
        <BreadcrumbItem>
          {nested ? (
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
        {onCrm ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>CRM</BreadcrumbPage>
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
