"use client";

import React from "react";
import { UseFormReturn } from "react-hook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TippingConfigLike } from "ssri-ckboost/types";

interface TippingConfigProps {
  form: UseFormReturn<TippingConfigLike>;
  pendingChanges?: boolean;
  ChangeIndicator?: React.FC<{ hasChanged: boolean }>;
}

export function TippingConfig({ 
  form, 
  pendingChanges,
  ChangeIndicator 
}: TippingConfigProps) {
  return (
    <Card className={pendingChanges ? "border-orange-500" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center">
          Tipping Configuration
          {ChangeIndicator && <ChangeIndicator hasChanged={!!pendingChanges} />}
        </CardTitle>
        <CardDescription>Tipping proposal settings</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="approval_requirement_thresholds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Approval Thresholds (CKB)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="1000&#10;5000&#10;10000"
                      value={field.value
                        .map((v) => {
                          // Convert from shannon (bigint) to CKB
                          const ckbValue = Number(v) / 100000000;
                          return ckbValue.toString();
                        })
                        .join("\n")}
                      onChange={(e) => {
                        const lines = e.target.value.split("\n").filter(Boolean);
                        const shannonValues = lines.map((line) => {
                          // Convert from CKB to shannon
                          const ckbValue = parseFloat(line) || 0;
                          const shannonValue = BigInt(Math.floor(ckbValue * 100000000));
                          return shannonValue.toString();
                        });
                        field.onChange(shannonValues);
                      }}
                      rows={3}
                    />
                  </FormControl>
                  <FormDescription>
                    Enter approval thresholds in CKB (one per line). For example: 1000, 5000, 10000.
                    These define the minimum CKB amounts for different approval tiers.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expiration_duration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expiration Duration (seconds)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      value={field.value ? field.value.toString() : ""}
                      onChange={(e) =>
                        field.onChange(BigInt(e.target.value || 0))
                      }
                      placeholder="2592000"
                    />
                  </FormControl>
                  <FormDescription>
                    How long proposals remain valid in seconds. Default is 2592000 (30 days).
                    Common values: 86400 (1 day), 604800 (7 days), 2592000 (30 days)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </Form>
      </CardContent>
    </Card>
  );
}