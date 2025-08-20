"use client";

import React from "react";
import { UseFormReturn } from "react-hook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Trash2 } from "lucide-react";
import { EndorserInfoLike, ProtocolData } from "ssri-ckboost/types";
import { ccc } from "@ckb-ccc/connector-react";

type DecodedProtocolData = ReturnType<typeof ProtocolData.decode>;

interface EndorserFormData extends EndorserInfoLike {
  inputMode: "address" | "script";
  address: string;
  script: ccc.Script;
}

interface EndorserManagementProps {
  endorserForm: UseFormReturn<EndorserFormData>;
  protocolData: DecodedProtocolData | null;
  pendingChanges?: boolean;
  pendingEndorserChanges: {
    toAdd: EndorserInfoLike[];
    toRemove: bigint[];
  };
  onAddEndorser: (data: EndorserFormData) => void;
  onRemoveEndorser: (index: number) => void;
  getPreviewLockHash: () => string;
}

export function EndorserManagement({
  endorserForm,
  protocolData,
  pendingChanges,
  pendingEndorserChanges,
  onAddEndorser,
  onRemoveEndorser,
  getPreviewLockHash,
}: EndorserManagementProps) {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Add Endorser</CardTitle>
          <CardDescription>
            Add new endorsers to the protocol whitelist
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...endorserForm}>
            <form
              onSubmit={endorserForm.handleSubmit(onAddEndorser)}
              className="space-y-4"
            >
              <FormField
                control={endorserForm.control}
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
                        <SelectItem value="script">
                          Lock Script
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose whether to provide a CKB address or directly
                      input a lock script
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {endorserForm.watch("inputMode") === "address" ? (
                <FormField
                  control={endorserForm.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Endorser Address</FormLabel>
                      <FormControl>
                        <Input placeholder="ckb1..." {...field} />
                      </FormControl>
                      <FormDescription>
                        CKB address of the endorser
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="space-y-2">
                  <FormLabel>Endorser Lock Script</FormLabel>
                  <div className="grid grid-cols-1 gap-2">
                    <FormField
                      control={endorserForm.control}
                      name="script.codeHash"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              placeholder="Code Hash (0x...)"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <FormField
                        control={endorserForm.control}
                        name="script.hashType"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Hash Type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="type">
                                    type
                                  </SelectItem>
                                  <SelectItem value="data">
                                    data
                                  </SelectItem>
                                  <SelectItem value="data1">
                                    data1
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={endorserForm.control}
                        name="script.args"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                placeholder="Args (0x...)"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Lock Hash Preview */}
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm font-medium mb-1">
                  Lock Hash Preview
                </div>
                <div className="text-xs font-mono text-muted-foreground break-all">
                  {getPreviewLockHash()}
                </div>
              </div>

              <FormField
                control={endorserForm.control}
                name="endorser_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endorser Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={endorserForm.control}
                name="endorser_description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Description of the endorser..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={endorserForm.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={endorserForm.control}
                name="social_links"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Social Links (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Comma-separated URLs"
                        value={field.value?.join(', ') || ''}
                        onChange={(e) => {
                          const links = e.target.value
                            .split(',')
                            .map(s => s.trim())
                            .filter(s => s.length > 0);
                          field.onChange(links);
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Enter multiple URLs separated by commas
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={endorserForm.control}
                name="verified"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verification Status</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select verification status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="0">Unverified</SelectItem>
                        <SelectItem value="1">Verified</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full">
                <UserPlus className="h-4 w-4 mr-2" />
                Add Endorser
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            Current Endorsers
            {pendingChanges && (
              <Badge variant="destructive" className="ml-2 text-xs">
                {pendingEndorserChanges.toAdd.length +
                  pendingEndorserChanges.toRemove.length}{" "}
                pending changes
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Active endorsers (
            {protocolData?.endorsers_whitelist.length || 0})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Show pending additions */}
            {pendingEndorserChanges.toAdd.map((endorser, index) => (
              <div
                key={`pending-${index}`}
                className="p-3 border border-green-500 rounded bg-green-50 dark:bg-green-950"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {endorser.endorser_name}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="text-xs bg-green-600 text-white"
                      >
                        Pending Add
                      </Badge>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {endorser.endorser_description}
                  </div>
                  {endorser.website && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Website:</span>{" "}
                      <a href={endorser.website} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                        {endorser.website}
                      </a>
                    </div>
                  )}
                  {endorser.social_links && endorser.social_links.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Social Links:</span>{" "}
                      {endorser.social_links.map((link, i) => (
                        <span key={i}>
                          {i > 0 && ", "}
                          <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                            {new URL(link).hostname}
                          </a>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Status:</span>{" "}
                    <span className={endorser.verified ? "text-green-600" : "text-gray-500"}>
                      {endorser.verified ? "Verified" : "Unverified"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Lock Hash:</span>{" "}
                    <span className="font-mono">
                      {typeof endorser.endorser_lock_hash === 'string' 
                        ? endorser.endorser_lock_hash 
                        : ccc.hexFrom(endorser.endorser_lock_hash)}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {/* Show existing endorsers */}
            {protocolData &&
              protocolData.endorsers_whitelist.map(
                (endorser: EndorserInfoLike, index: number) => {
                  const isMarkedForRemoval =
                    pendingEndorserChanges.toRemove.includes(
                      BigInt(index)
                    );

                  const endorserName = endorser.endorser_name;
                  const endorserDescription = endorser.endorser_description;
                  const website = endorser.website;

                  return (
                    <div
                      key={index}
                      className={`p-3 border rounded ${
                        isMarkedForRemoval
                          ? "border-red-500 bg-red-50 dark:bg-red-950 opacity-75"
                          : ""
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div
                            className={`font-medium ${
                              isMarkedForRemoval ? "line-through" : ""
                            }`}
                          >
                            {endorserName || `Endorser ${index + 1}`}
                          </div>
                          <div className="flex items-center gap-2">
                            {isMarkedForRemoval ? (
                              <Badge
                                variant="destructive"
                                className="text-xs"
                              >
                                Pending Remove
                              </Badge>
                            ) : (
                              <Badge
                                variant="default"
                                className="text-xs"
                              >
                                Active
                              </Badge>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onRemoveEndorser(index)}
                              className="text-red-600 hover:text-red-700"
                              disabled={isMarkedForRemoval}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div
                          className={`text-sm text-muted-foreground ${
                            isMarkedForRemoval ? "line-through" : ""
                          }`}
                        >
                          {endorserDescription}
                        </div>
                        {website && (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Website:</span>{" "}
                            <a href={website} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                              {website}
                            </a>
                          </div>
                        )}
                        {endorser.social_links && endorser.social_links.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Social Links:</span>{" "}
                            {endorser.social_links.map((link, i) => (
                              <span key={i}>
                                {i > 0 && ", "}
                                <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                                  {new URL(link).hostname}
                                </a>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">Status:</span>{" "}
                          <span className={endorser.verified ? "text-green-600" : "text-gray-500"}>
                            {endorser.verified ? "Verified" : "Unverified"}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          <span className="font-medium font-sans">Lock Hash:</span>{" "}
                          {typeof endorser.endorser_lock_hash === 'string' 
                            ? endorser.endorser_lock_hash 
                            : ccc.hexFrom(endorser.endorser_lock_hash)}
                        </div>
                      </div>
                    </div>
                  );
                }
              )}

            {(!protocolData ||
              protocolData.endorsers_whitelist.length === 0) &&
              pendingEndorserChanges.toAdd.length === 0 && (
                <div className="text-center text-muted-foreground py-4">
                  No endorsers configured
                </div>
              )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}