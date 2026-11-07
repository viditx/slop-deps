#define MyAppName "slop-deps"
#define MyAppVersion "1.4.0"
#define MyAppPublisher "Vidit Patil"
#define MyAppURL "https://github.com/viditx/slop-deps"

[Setup]
AppId={{8B16B95F-9104-4F96-880A-2B8A0D97E4A1}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\slop-deps
DisableDirPage=no
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=dist
OutputBaseFilename=slopdeps-installer
SetupIconFile=slopdeps.ico
WizardImageFile=installer-banner.bmp
WizardSmallImageFile=installer-small.bmp
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ChangesEnvironment=yes
UninstallDisplayName={#MyAppName} (AI Dependency Hallucination Scanner)
UninstallDisplayIcon={app}\bin\slopdeps.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "bin\*"; DestDir: "{app}\bin"; Excludes: "*.pdb,installer.exe,slopdeps-installer.exe"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "src\*"; DestDir: "{app}\src"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "PRIVACY.md"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}\bin"; Check: NeedsAddPath(ExpandConstant('{app}\bin'))

[UninstallDelete]
Type: files; Name: "{app}\bin\*.cmd"
Type: files; Name: "{app}\bin\*.ps1"
Type: files; Name: "{app}\bin\*.exe"
Type: dirifempty; Name: "{app}\bin"
Type: dirifempty; Name: "{app}"

[Code]
var
  ShortcutPage: TInputQueryWizardPage;
  TutorialPage: TOutputMsgMemoWizardPage;
  TestRunCheckbox: TCheckBox;

function NeedsAddPath(Param: string): boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath)
  then begin
    Result := True;
    exit;
  end;
  Result := Pos(';' + UpperCase(Param) + ';', ';' + UpperCase(OrigPath) + ';') = 0;
end;

function IsCommandTaken(CmdName: string): Boolean;
var
  ResultCode: Integer;
  Lower: string;
begin
  Lower := LowerCase(Trim(CmdName));
  
  // Allow our own tool names even if already on path from previous install
  if (Lower = 'slopdeps') or (Lower = 'slop-deps') then
  begin
    Result := False;
    Exit;
  end;

  // Reserved Windows built-in keywords
  if (Lower = 'dir') or (Lower = 'cd') or (Lower = 'del') or (Lower = 'copy') or 
     (Lower = 'cls') or (Lower = 'exit') or (Lower = 'type') or (Lower = 'start') or
     (Lower = 'cmd') or (Lower = 'powershell') or (Lower = 'pwsh') or (Lower = 'con') or
     (Lower = 'prn') or (Lower = 'aux') or (Lower = 'nul') then
  begin
    Result := True;
    Exit;
  end;

  // Run where.exe to check current PATH
  if Exec('where.exe', CmdName, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    Result := (ResultCode = 0);
  end
  else
  begin
    Result := False;
  end;
end;

function IsValidCommandName(CmdName: string): Boolean;
var
  I: Integer;
  C: Char;
begin
  if Length(CmdName) = 0 then
  begin
    Result := False;
    Exit;
  end;

  // First character must be an ASCII letter (a-z, A-Z) to prevent flags like -v or switches
  C := CmdName[1];
  if not (((C >= 'a') and (C <= 'z')) or ((C >= 'A') and (C <= 'Z'))) then
  begin
    Result := False;
    Exit;
  end;

  Result := True;
  for I := 1 to Length(CmdName) do
  begin
    C := CmdName[I];
    if not (((C >= 'a') and (C <= 'z')) or
            ((C >= 'A') and (C <= 'Z')) or
            ((C >= '0') and (C <= '9')) or
            (C = '-') or (C = '_')) then
    begin
      Result := False;
      Exit;
    end;
  end;
end;

function GetChosenShortcut: string;
var
  Val: string;
begin
  Val := Trim(ShortcutPage.Values[0]);
  if Val = '' then
    Val := 'slopdeps';
  Result := Val;
end;

procedure InitializeWizard;
begin
  // Page 1: Custom Shortcut Selection (after Directory selection)
  ShortcutPage := CreateInputQueryPage(wpSelectDir,
    'Terminal Command Shortcut',
    'Choose your preferred command shortcut',
    'Choose what command name you want to type in CMD or PowerShell to run slop-deps.'#13#10 +
    'You can keep the default "slopdeps" or give yourself a custom shortcut (e.g. slp, sd, chk).');
  ShortcutPage.Add('Command Shortcut:', False);
  ShortcutPage.Values[0] := 'slopdeps';

  // Page 2: Tutorial / How to use guide (after Shortcut selection)
  TutorialPage := CreateOutputMsgMemoPage(ShortcutPage.ID,
    'How to Use slop-deps',
    'Quickstart guide and command syntax',
    'Here is how you can use slop-deps from your command line:'#13#10 +
    'Click Next when you are ready to install.',
    '');

  // Add "Open terminal" checkbox on Finished Page
  TestRunCheckbox := TCheckBox.Create(WizardForm);
  TestRunCheckbox.Parent := WizardForm.FinishedPage;
  TestRunCheckbox.Left := WizardForm.FinishedHeadingLabel.Left;
  TestRunCheckbox.Top := WizardForm.FinishedHeadingLabel.Top + WizardForm.FinishedHeadingLabel.Height + ScaleY(80);
  TestRunCheckbox.Width := ScaleX(360);
  TestRunCheckbox.Height := ScaleY(24);
  TestRunCheckbox.Caption := 'Open terminal and test command when setup finishes';
  TestRunCheckbox.Checked := True;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Shortcut: string;
  MemoText: string;
begin
  Result := True;

  // Validation on Shortcut Page
  if CurPageID = ShortcutPage.ID then
  begin
    Shortcut := Trim(ShortcutPage.Values[0]);

    if not IsValidCommandName(Shortcut) then
    begin
      MsgBox('Please enter a valid command name (letters, numbers, hyphens, and underscores only, with no spaces).', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    if IsCommandTaken(Shortcut) then
    begin
      MsgBox('The command "' + Shortcut + '" is already used by an existing program or command on your system.'#13#10#13#10 +
             'Please choose another shortcut name so you do not override your existing tools.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    // Dynamically update the Tutorial page text with user's chosen shortcut
    MemoText :=
      'YOUR CONFIGURED COMMAND: ' + Shortcut + #13#10#13#10 +
      'BASIC USAGE IN ANY TERMINAL:' + #13#10 +
      '  ' + Shortcut + '                  Scan current repository imports' + #13#10 +
      '  ' + Shortcut + ' <folder>         Scan a specific directory or project' + #13#10 +
      '  ' + Shortcut + ' --staged         Git pre-commit mode (scans staged files only)' + #13#10 +
      '  ' + Shortcut + ' --offline        Air-gapped verification (zero network requests)' + #13#10 +
      '  ' + Shortcut + ' --json           Output raw JSON for scripts and CI/CD' + #13#10 +
      '  ' + Shortcut + ' --fix            Attempt automated AI repair with .bak backups' + #13#10#13#10 +
      'HOW IT WORKS:' + #13#10 +
      '  AI code tools (Cursor, Copilot, Claude) invent hallucinated dependencies.' + #13#10 +
      '  Attackers register those names with malware. slop-deps detects and catches them' + #13#10 +
      '  before they reach your lockfile.' + #13#10#13#10 +
      'Click Next to proceed with the installation.';

    TutorialPage.RichEditViewer.Text := MemoText;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  BinDir, Shortcut: string;
  CmdContent, PsContent: string;
  SourceExe, TargetExe: string;
begin
  if CurStep = ssPostInstall then
  begin
    BinDir := ExpandConstant('{app}\bin');
    Shortcut := GetChosenShortcut;

    // 1. Generate <Shortcut>.cmd (runs standalone launcher if present, falls back to node)
    CmdContent :=
      '@ECHO OFF' + #13#10 +
      'IF EXIST "%~dp0\slopdeps.exe" (' + #13#10 +
      '  "%~dp0\slopdeps.exe" %*' + #13#10 +
      ') ELSE (' + #13#10 +
      '  node "%~dp0\slop-deps.js" %*' + #13#10 +
      ')' + #13#10;
    SaveStringToFile(BinDir + '\' + Shortcut + '.cmd', CmdContent, False);

    // 2. Generate <Shortcut>.ps1
    PsContent :=
      'if (Test-Path "$PSScriptRoot\slopdeps.exe") {' + #13#10 +
      '  & "$PSScriptRoot\slopdeps.exe" $args' + #13#10 +
      '} else {' + #13#10 +
      '  & node "$PSScriptRoot\slop-deps.js" $args' + #13#10 +
      '}' + #13#10;
    SaveStringToFile(BinDir + '\' + Shortcut + '.ps1', PsContent, False);

    // 3. Copy slopdeps.exe to <Shortcut>.exe if shortcut differs
    SourceExe := BinDir + '\slopdeps.exe';
    TargetExe := BinDir + '\' + Shortcut + '.exe';
    if (LowerCase(Shortcut) <> 'slopdeps') and FileExists(SourceExe) then
    begin
      CopyFile(SourceExe, TargetExe, False);
    end;

    // Always ensure slopdeps.cmd and slopdeps.ps1 exist too
    SaveStringToFile(BinDir + '\slopdeps.cmd', CmdContent, False);
    SaveStringToFile(BinDir + '\slopdeps.ps1', PsContent, False);
  end;
end;

procedure DeinitializeSetup;
var
  ResultCode: Integer;
  Shortcut: string;
begin
  // If user checked "Open terminal and test command", launch it
  if (TestRunCheckbox <> nil) and TestRunCheckbox.Checked then
  begin
    Shortcut := GetChosenShortcut;
    // Launch cmd running the command help
    Exec('cmd.exe', '/k echo =================================================== && echo Testing ' + Shortcut + ' command: && echo =================================================== && "' + ExpandConstant('{app}\bin\') + Shortcut + '.cmd" --help', '', SW_SHOW, ewNoWait, ResultCode);
  end;
end;

function RemoveDirFromPath(const PathStr, DirToRemove: string): string;
var
  Target, Rest, Part, ResultPath: string;
  P: Integer;
begin
  Target := UpperCase(Trim(DirToRemove));
  Rest := PathStr;
  ResultPath := '';
  while Length(Rest) > 0 do
  begin
    P := Pos(';', Rest);
    if P > 0 then
    begin
      Part := Trim(Copy(Rest, 1, P - 1));
      Rest := Copy(Rest, P + 1, Length(Rest) - P);
    end
    else
    begin
      Part := Trim(Rest);
      Rest := '';
    end;
    if (Length(Part) > 0) and (UpperCase(Part) <> Target) then
    begin
      if Length(ResultPath) > 0 then
        ResultPath := ResultPath + ';' + Part
      else
        ResultPath := Part;
    end;
  end;
  Result := ResultPath;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  BinDir, OrigPath, NewPath: string;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    BinDir := ExpandConstant('{app}\bin');
    if RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then
    begin
      NewPath := RemoveDirFromPath(OrigPath, BinDir);
      if NewPath <> OrigPath then
      begin
        RegWriteStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', NewPath);
      end;
    end;
  end;
end;
