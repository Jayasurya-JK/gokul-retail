GOKUL RETAIL - COPY THE OLD POSBean PC (WINDOWS 7 VERSION)
==========================================================

This is the Windows 7 version of Copy-OldPC.ps1. It uses PowerShell 2.0,
which is built into Windows 7. It is for the old billing PC only.

What this does
--------------
It copies the POSBean database files, the POSBean program folder, the D: drive
and the Desktop and Documents folders into ONE new folder.

It does NOT format, delete, change or move anything on the old PC.
It writes only that one new folder. Nothing else is written.

Where the copy goes
-------------------
The script looks at the drive it runs from:

  - If it runs from a NEW disk (for example E:) that is not C: or D: and has
    enough free space, the copy goes to:
        E:\OldPC-Backup-<yyyyMMdd-HHmm>\
    No zip is made in this case.

  - Otherwise (it runs from C: or D:, or the disk is too small), the copy goes to:
        C:\GokulExport\OldPC-<yyyyMMdd-HHmm>\
    and two zip files are made next to it:
        C:\GokulExport\OldPC-<stamp>-DATABASE.zip   (the important small one)
        C:\GokulExport\OldPC-<stamp>-REST.zip       (optional)

The script shows the destination and the free-space check, then asks you to
type YES. Nothing is stopped before YES.

The copy runs in two phases, so billing is stopped for as little time as possible:

  PHASE A  (POSBean closed, a few minutes)
           Copies only the database files and the database engine data folders,
           cleanly, and checks their sizes. Then the database services start again.

  PHASE B  (POSBean may be open again)
           Copies the D: drive, the POSBean program folder and the Desktop and
           Documents folders. Database files are left out of these copies,
           because they were live. The clean copies from Phase A are used instead.

Steps for the shop owner
------------------------
1. Copy this whole win7 folder onto a pen drive, or onto the old PC's Desktop.
   Do not put it inside C:\GokulExport.

2. Log in to the old PC as the usual Windows user (an Administrator account).
   Plug in the NEW disk if you are using it, and open the win7 folder FROM THE NEW DISK
   if you want the copy to go there.

3. Double-click  Export-OldPC.bat
   - Click YES if Windows asks for permission.
   - Read the destination it shows. Type YES to continue, or press Enter to cancel.

4. The script prints a time estimate for each phase.

5. PHASE A. The script says: close POSBean normally (File, Exit, or the close
   button), then type DONE and press Enter.
   - The script never kills POSBean. If POSBean is still open, it asks again.
   - The database services are stopped one by one. If one will not stop, the
     script starts everything again and stops, without killing anything.
   - When the database files are copied and checked, the services start again.
   - The screen then shows in big green letters:
         BILLING CAN START AGAIN NOW. You can open POSBean.
   - You can open POSBean at that point. Phase B does not need it closed.

6. PHASE B runs while POSBean may be open. Wait for it to finish. Do not switch
   the PC off during the copy. A large D: drive can take an hour or more.

7. If the destination is C:\GokulExport, the script now makes the zip files.
   - It prints the size of each zip in MB.
   - Copy the DATABASE zip to a pen drive or upload it to Google Drive first.
     The REST zip is optional.
   - If the script prints "Use 7-Zip for this folder", a single file is over
     3.9 GB and the built-in Windows zip cannot hold it. Use 7-Zip on that folder
     instead (the path is printed).

8. At the end the window says where the backup folder is and how many database
   files were copied and checked. Press any key to close.

9. Keep the old PC as it is until the team confirms the backup is readable.

What is in the backup folder
----------------------------
  README-in-backup.txt  short note: which folder has the clean database copies
  inventory.txt         drives, programs, database services and every database-like
                        file found (name, size, date)
  run-log.txt           everything the script did, with times
  copy-log.txt          the detailed copy log from robocopy
  verify.txt            OK / MISSING / SIZE MISMATCH for each database file
  database-files\       CLEAN copies of all database files and engine data folders
  D-drive\              the D: drive, without database files
  posbean-program\      the POSBean program folder, without database files
  C-user-files\         Desktop and Documents of each Windows user, without database files

If something goes wrong
-----------------------
- verify.txt lists MISSING or SIZE MISMATCH files. Tell the team; do not re-run
  into the same backup folder.
- If the script says a service could not be restarted, open Services (search
  "services" in the Start menu), find the service, and click Start before opening POSBean.
- If the script says "Not enough free space", nothing was stopped or copied.
  Free up space on the drive it names, or use a bigger disk, then run it again.

Test without copying (for the team only)
----------------------------------------
Open PowerShell in this folder and run:

  powershell -NoProfile -ExecutionPolicy Bypass -File Export-OldPC.ps1 -WhatIf

This only makes the inventory and prints the plan. It asks no questions, stops
nothing, copies nothing and zips nothing. The inventory goes to C:\GokulExport\WhatIf-<stamp>\
unless you give another folder with  -WhatIfFolder "<folder>".
