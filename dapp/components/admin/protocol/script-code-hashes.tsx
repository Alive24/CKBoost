"use client";

import React from "react";
import { UseFormReturn } from "react-hook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ScriptCodeHashesLike } from "ssri-ckboost/types";
import { UDTScriptManager } from "./udt-script-manager";
import { ccc } from "@ckb-ccc/connector-react";

interface ScriptCodeHashesProps {
  form: UseFormReturn<ScriptCodeHashesLike>;
  pendingChanges?: boolean;
  ChangeIndicator?: React.FC<{ hasChanged: boolean }>;
}

export function ScriptCodeHashes({ 
  form, 
  pendingChanges,
  ChangeIndicator 
}: ScriptCodeHashesProps) {
  return (
    <Card className={pendingChanges ? "border-orange-500" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center">
          Script Code Hashes
          {ChangeIndicator && <ChangeIndicator hasChanged={!!pendingChanges} />}
        </CardTitle>
        <CardDescription>
          Configure the code hashes for protocol contracts
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="ckb_boost_protocol_type_code_hash"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Protocol Type Code Hash</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="0x..." 
                      {...field}
                      value={field.value ? String(field.value) : ""}
                    />
                  </FormControl>
                  <FormDescription>
                    The code hash of the protocol type script
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ckb_boost_protocol_lock_code_hash"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Protocol Lock Code Hash</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="0x..." 
                      {...field}
                      value={field.value ? String(field.value) : ""}
                    />
                  </FormControl>
                  <FormDescription>
                    The code hash of the protocol lock script
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ckb_boost_campaign_type_code_hash"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Campaign Type Code Hash</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="0x..." 
                      {...field}
                      value={field.value ? String(field.value) : ""}
                    />
                  </FormControl>
                  <FormDescription>
                    The code hash of the campaign type script
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ckb_boost_campaign_lock_code_hash"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Campaign Lock Code Hash</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="0x..." 
                      {...field}
                      value={field.value ? String(field.value) : ""}
                    />
                  </FormControl>
                  <FormDescription>
                    The code hash of the campaign lock script
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ckb_boost_user_type_code_hash"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>User Type Code Hash</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="0x..." 
                      {...field}
                      value={field.value ? String(field.value) : ""}
                    />
                  </FormControl>
                  <FormDescription>
                    The code hash of the user type script
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ckb_boost_points_udt_type_code_hash"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Points UDT Type Code Hash</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="0x..." 
                      {...field}
                      value={field.value ? String(field.value) : ""}
                    />
                  </FormControl>
                  <FormDescription>
                    The code hash of the Points UDT type script
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* UDT Script Manager for accepted UDT and DOB scripts */}
            <div className="space-y-4 border-t pt-4">
              <h4 className="text-sm font-medium">Accepted UDT Scripts</h4>
              <UDTScriptManager
                scripts={form.watch("accepted_udt_type_scripts") || []}
                onChange={(scripts: ccc.ScriptLike[]) => {
                  form.setValue("accepted_udt_type_scripts", scripts);
                }}
                title="UDT Type Scripts"
                description="Manage accepted UDT type scripts for the protocol"
              />
            </div>

            <div className="space-y-4 border-t pt-4">
              <h4 className="text-sm font-medium">Accepted DOB Scripts</h4>
              <UDTScriptManager
                scripts={form.watch("accepted_dob_type_scripts") || []}
                onChange={(scripts: ccc.ScriptLike[]) => {
                  form.setValue("accepted_dob_type_scripts", scripts);
                }}
                title="DOB Type Scripts"
                description="Manage accepted DOB type scripts for the protocol"
              />
            </div>
          </div>
        </Form>
      </CardContent>
    </Card>
  );
}