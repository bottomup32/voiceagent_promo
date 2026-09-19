import { PhoneOff } from "lucide-react";

export default function DemoNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <PhoneOff className="size-6 text-muted-foreground" aria-hidden />
      <h1 className="ta-headline-1">This demo isn&apos;t available.</h1>
      <p className="ta-body-2 text-muted-foreground">
        The link may be paused or expired. Ask for a new one.
      </p>
    </main>
  );
}
