"use client";

import React from "react";
import { useForm, UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Trash2 } from "lucide-react";
import { ccc } from "@ckb-ccc/connector-react";
import { ProtocolData } from "ssri-ckboost/types";

type DecodedProtocolData = ReturnType<typeof ProtocolData.decode>;

type AddAdminForm = {
  inputMode: "address" | "script";
  adminAddress?: string;
  adminLockHash?: string;
};

const addAdminSchema = z.object({
  inputMode: z.enum(["address", "script"]),
  adminAddress: z.string().optional(),
  adminLockHash: z
    .string()
    .optional(),
}).refine(
  (data) => {
    if (data.inputMode === "address") {
      return data.adminAddress && data.adminAddress.length > 0;
    } else {
      return data.adminLockHash && data.adminLockHash.match(/^0x[a-fA-F0-9]{64}$/);
    }
  },
  {
    message: "Please provide either an address or a valid lock hash",
    path: ["adminAddress"],
  }
);

interface AdminManagementProps {
  adminForm: UseFormReturn<AddAdminForm>;
  protocolData: DecodedProtocolData | null;
  pendingChanges: { admins: boolean };
  pendingAdminChanges: {
    toAdd: string[];
    toRemove: string[];
  };
  finalAdminLockHashes: string[];
  onAddAdmin: (data: AddAdminForm) => void;
  onRemoveAdmin: (index: number) => void;
}

export function AdminManagement({
  adminForm,
  protocolData,
  pendingChanges,
  pendingAdminChanges,
  finalAdminLockHashes,
  onAddAdmin,
  onRemoveAdmin,
}: AdminManagementProps) {

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Add Admin</CardTitle>
          <CardDescription>
            Add new administrators to the protocol
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...adminForm}>
            <form
              onSubmit={adminForm.handleSubmit(onAddAdmin)}
              className="space-y-4"
            >
              <FormField
                control={adminForm.control}
                name="inputMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Input Method</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select input method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="address">
                          CKB Address
                        </SelectItem>
                        <SelectItem value="script">Lock Hash</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose whether to input a CKB address or lock hash
                      directly
                    </FormDescription>
                  </FormItem>
                )}
              />
              {adminForm.watch("inputMode") === "address" && (
                <FormField
                  control={adminForm.control}
                  name="adminAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Admin Address</FormLabel>
                      <FormControl>
                        <Input placeholder="ckt1..." {...field} />
                      </FormControl>
                      <FormDescription>
                        The CKB address of the admin
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {adminForm.watch("inputMode") === "script" && (
                <FormField
                  control={adminForm.control}
                  name="adminLockHash"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Admin Lock Hash</FormLabel>
                      <FormControl>
                        <Input placeholder="0x..." {...field} />
                      </FormControl>
                      <FormDescription>
                        The lock hash of the admin (32 bytes)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <Button type="submit" className="w-full">
                <UserPlus className="h-4 w-4 mr-2" />
                Add Admin
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className={pendingChanges.admins ? "border-orange-500" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center">
            Current Admins
            {pendingChanges.admins && (
              <Badge variant="destructive" className="ml-2 text-xs">
                {pendingAdminChanges.toAdd.length +
                  pendingAdminChanges.toRemove.length}{" "}
                pending changes
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Active administrators ({finalAdminLockHashes.length})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Show pending additions */}
            {pendingAdminChanges.toAdd.map((lockHash, index) => (
              <div
                key={`pending-admin-${index}`}
                className="p-3 border border-green-500 rounded bg-green-50 dark:bg-green-950"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-xs break-all flex-1 min-w-0">
                    {lockHash}
                  </div>
                  <Badge
                    variant="secondary"
                    className="text-xs bg-green-600 text-white shrink-0"
                  >
                    Pending Add
                  </Badge>
                </div>
              </div>
            ))}

            {/* Show existing admins */}
            {protocolData &&
              protocolData.protocol_config.admin_lock_hash_vec.map(
                (admin: ccc.BytesLike, index: number) => {
                  const isMarkedForRemoval =
                    pendingAdminChanges.toRemove.includes(
                      `0x${index.toString(16)}` as `0x${string}`
                    );
                  const adminHash =
                    typeof admin === "string"
                      ? (admin as ccc.Hex)
                      : ccc.hexFrom(admin);
                  return (
                    <div
                      key={index}
                      className={`p-3 border rounded ${
                        isMarkedForRemoval
                          ? "border-red-500 bg-red-50 dark:bg-red-950 opacity-75"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div
                          className={`font-mono text-xs break-all flex-1 min-w-0 ${
                            isMarkedForRemoval ? "line-through" : ""
                          }`}
                        >
                          {adminHash}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isMarkedForRemoval ? (
                            <Badge
                              variant="destructive"
                              className="text-xs"
                            >
                              Pending Remove
                            </Badge>
                          ) : (
                            <Badge variant="default" className="text-xs">
                              Active
                            </Badge>
                          )}
                          {protocolData.protocol_config
                            .admin_lock_hash_vec.length > 1 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onRemoveAdmin(index)}
                              className="text-red-600 hover:text-red-700"
                              disabled={isMarkedForRemoval}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }
              )}

            {(!protocolData ||
              protocolData.protocol_config.admin_lock_hash_vec.length ===
                0) &&
              pendingAdminChanges.toAdd.length === 0 && (
                <div className="text-center text-muted-foreground py-4">
                  No admins configured
                </div>
              )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}