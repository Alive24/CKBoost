"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { ProfileContent } from "@/components/profile/profile-content";
import { useUserProfileByAddress } from "@/lib/hooks/use-user-profile-by-address";

export default function ProfileByAddressPage() {
  const params = useParams<{ address?: string | string[] }>();

  const rawAddress = useMemo(() => {
    const value = params?.address;
    if (!value) return "";
    if (Array.isArray(value)) {
      return value[0] ?? "";
    }
    return value;
  }, [params]);

  const decodedAddress = useMemo(() => {
    try {
      return decodeURIComponent(rawAddress);
    } catch {
      return rawAddress;
    }
  }, [rawAddress]);

  const sanitizedAddress = decodedAddress.trim();

  const { userData, userTypeId, isLoading, error } =
    useUserProfileByAddress(sanitizedAddress ? sanitizedAddress : null);

  const loadError = sanitizedAddress ? error : "Missing CKB address";

  return (
    <ProfileContent
      context="address"
      isLoading={sanitizedAddress ? isLoading : false}
      loadError={loadError}
      userData={userData}
      userTypeId={userTypeId}
      fallbackAddress={sanitizedAddress || undefined}
    />
  );
}
