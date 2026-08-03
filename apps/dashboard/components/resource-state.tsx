"use client";

import type { ReactNode } from "react";

import type { ApiResource } from "../lib/use-api-resource";
import { StateBlock } from "./status";

interface ResourceStateProps<T> {
  resource: ApiResource<T>;
  empty: boolean;
  emptyTitle: string;
  emptyDetail: string;
  children: ReactNode;
}

export function ResourceState<T>({
  resource,
  empty,
  emptyTitle,
  emptyDetail,
  children
}: ResourceStateProps<T>) {
  if (resource.loading) {
    return <StateBlock title="Loading" detail="Requesting current Worker data." />;
  }
  if (resource.error?.locked) {
    return (
      <StateBlock
        title="Access Locked"
        detail="Authenticate through the configured Cloudflare Access application, then retry."
        tone="danger"
        action={<button onClick={resource.retry}>Retry</button>}
      />
    );
  }
  if (resource.error) {
    return (
      <StateBlock
        title="Worker Unavailable"
        detail={resource.error.message}
        tone="warn"
        action={<button onClick={resource.retry}>Retry</button>}
      />
    );
  }
  if (empty) {
    return <StateBlock title={emptyTitle} detail={emptyDetail} />;
  }
  return children;
}
