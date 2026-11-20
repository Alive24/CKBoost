"use client";

import { ProfileContent } from "@/components/profile/profile-content";
import { useUser } from "@/lib/providers/user-provider";

export default function ProfilePage() {
  const {
    currentUserData,
    currentUserTypeId,
    userRecommendedAddressObj,
    isLoading,
    error,
    updateDisplayName,
  } = useUser();

  return (
    <ProfileContent
      context="self"
      isLoading={isLoading}
      loadError={error}
      userData={currentUserData}
      userTypeId={currentUserTypeId}
      fallbackAddress={userRecommendedAddressObj?.toString()}
      onDisplayNameChange={updateDisplayName}
    />
  );
}
