<header className="flex items-center gap-2 border-b border-border/70 bg-background/90 px-3 py-2.5 backdrop-blur-xl">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Buka menu"><Menu className="size-5" /></Button>
          <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => setDesktopOpen((v) => !v)} aria-label="Toggle sidebar"><PanelLeftClose className="size-5" /></Button>

          <div className="min-w-0 flex-1">
            <Select value={selectedValue} onValueChange={handleProviderModelChange}>
              <SelectTrigger className="md:hidden h-8 w-full rounded-lg bg-card/60 text-xs px-2">
                <SelectValue placeholder={activeModelLabel} />
              </SelectTrigger>
              <SelectContent>{providerModelItems}</SelectContent>
            </Select>
            <p className="hidden md:block truncate text-sm font-semibold tracking-tight text-foreground" title={activeProvider?.model ?? ""}>{activeModelLabel}</p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 rounded-full bg-card/70"><ModeIcon mode={mode} /> {modeLabel(mode)} <ChevronDown className="size-3" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl">
              <DropdownMenuItem onClick={() => setMode("normal")}><Sparkles className="mr-2 size-4" /> Plain</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMode("realtime")}><Search className="mr-2 size-4" /> Real Time</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMode("github")}><Github className="mr-2 size-4" /> GitHub</DropdownMenuItem>
              {mode === "github" && <>
                <DropdownMenuItem onClick={() => inputRef.current?.setText("Tambah tombol ")}>Tambah tombol</DropdownMenuItem>
                <DropdownMenuItem onClick={() => inputRef.current?.setText("Hapus tombol ")}>Hapus tombol</DropdownMenuItem>
                <DropdownMenuItem onClick={() => inputRef.current?.setText("Perbaiki error ")}>Perbaiki error</DropdownMenuItem>
                <DropdownMenuItem onClick={() => inputRef.current?.setText("cek build")}>Cek build</DropdownMenuItem>
                <DropdownMenuItem onClick={() => inputRef.current?.setText("PUSH")}>Push</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>

          {providers.length > 0 && <Select value={selectedValue} onValueChange={handleProviderModelChange}><SelectTrigger className="hidden h-9 w-56 rounded-xl text-xs lg:flex"><SelectValue placeholder="Pilih provider" /></SelectTrigger><SelectContent>{providerModelItems}</SelectContent></Select>}
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Menu"><FileText className="size-5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuItem onClick={() => setStatusOpen(true)}><Sparkles className="mr-2 size-4" /> Status</DropdownMenuItem><DropdownMenuItem asChild><Link to="/settings"><Settings className="mr-2 size-4" /> Settings</Link></DropdownMenuItem><DropdownMenuItem onClick={() => handleExport("txt")} disabled={!messages.length}><Download className="mr-2 size-4" /> Export TXT</DropdownMenuItem><DropdownMenuItem onClick={() => handleExport("json")} disabled={!messages.length}><FileJson className="mr-2 size-4" /> Export JSON</DropdownMenuItem><DropdownMenuItem onClick={handleClear} disabled={!messages.length}><Eraser className="mr-2 size-4" /> Clear Chat</DropdownMenuItem><DropdownMenuItem onClick={handleClearAllChats} disabled={!conversations.length} className="text-destructive focus:text-destructive"><Eraser className="mr-2 size-4" /> Hapus semua chat</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </header>