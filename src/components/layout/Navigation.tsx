'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Scale, FilePlus, FolderOpen, Palette, X, Upload, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useCustomization } from '@/lib/customization-context';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function Navigation() {
  const pathname = usePathname();
  const { settings, updateSiteName, updateLogo, resetSettings } = useCustomization();
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [tempSiteName, setTempSiteName] = useState(settings.siteName || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const navItems = [
    { href: '/', label: 'New Comparison', icon: FilePlus },
    { href: '/comparisons', label: 'My Comparisons', icon: FolderOpen },
  ];

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveCustomization = () => {
    updateSiteName(tempSiteName.trim() || null);
    setIsCustomizeOpen(false);
  };

  const handleReset = () => {
    resetSettings();
    setTempSiteName('');
    setIsCustomizeOpen(false);
  };

  const openCustomizePanel = () => {
    setTempSiteName(settings.siteName || '');
    setIsCustomizeOpen(true);
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center">
          {/* Logo and Title - Always on the left, same spacing */}
          <div className="flex items-center mr-6">
            <Link href="/" className="flex items-center space-x-2">
              {settings.logoUrl ? (
                <Image
                  src={settings.logoUrl}
                  alt="Logo"
                  width={24}
                  height={24}
                  className="h-6 w-6 object-contain"
                />
              ) : (
                <Scale className="h-6 w-6 text-muted-foreground" />
              )}
              <span className="hidden font-bold sm:inline-block">
                {settings.siteName || 'Contract Clause Comparator'}
              </span>
            </Link>
          </div>

          {/* Navigation Links - Always visible */}
          <Separator orientation="vertical" className="mr-4 h-6" />
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || 
                (item.href !== '/' && pathname.startsWith(item.href));
              
              return (
                <Button
                  key={item.href}
                  variant={isActive ? 'secondary' : 'ghost'}
                  size="sm"
                  asChild
                >
                  <Link href={item.href} className="gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="hidden sm:inline-block">{item.label}</span>
                  </Link>
                </Button>
              );
            })}
          </nav>

          {/* Right side - Customize button */}
          <div className="flex flex-1 items-center justify-end space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={openCustomizePanel}
              title="Customize appearance"
            >
              <Palette className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </header>

      {/* Customization Panel Overlay */}
      {isCustomizeOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
          <div className="fixed inset-y-0 right-0 w-full max-w-md border-l bg-background shadow-lg">
            <div className="flex h-full flex-col">
              {/* Panel Header */}
              <div className="flex items-center justify-between border-b px-6 py-4">
                <h2 className="text-lg font-semibold">Customize Appearance</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsCustomizeOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Panel Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Logo Upload */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Logo</CardTitle>
                    <CardDescription>
                      Upload your firm&apos;s logo to replace the default icon
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="h-16 w-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/50">
                        {settings.logoUrl ? (
                          <Image
                            src={settings.logoUrl}
                            alt="Uploaded logo"
                            width={48}
                            height={48}
                            className="h-12 w-12 object-contain"
                          />
                        ) : (
                          <Scale className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          className="gap-2"
                        >
                          <Upload className="h-4 w-4 text-muted-foreground" />
                          Upload Logo
                        </Button>
                        {settings.logoUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateLogo(null)}
                            className="text-muted-foreground"
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Site Name */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Site Name</CardTitle>
                    <CardDescription>
                      Replace &quot;Contract Clause Comparator&quot; with your custom name
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={tempSiteName}
                        onChange={(e) => setTempSiteName(e.target.value)}
                        placeholder="Enter custom name..."
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                      <p className="text-xs text-muted-foreground">
                        Leave empty to use the default name.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Preview */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <div className="flex items-center gap-2">
                        {settings.logoUrl ? (
                          <Image
                            src={settings.logoUrl}
                            alt="Logo preview"
                            width={20}
                            height={20}
                            className="h-5 w-5 object-contain"
                          />
                        ) : (
                          <Scale className="h-5 w-5 text-muted-foreground" />
                        )}
                        <span className="font-bold text-sm">
                          {tempSiteName.trim() || 'Contract Clause Comparator'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Panel Footer */}
              <div className="border-t px-6 py-4 flex items-center justify-between">
                <Button
                  variant="ghost"
                  onClick={handleReset}
                  className="gap-2 text-muted-foreground"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset to Default
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsCustomizeOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSaveCustomization}>
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
