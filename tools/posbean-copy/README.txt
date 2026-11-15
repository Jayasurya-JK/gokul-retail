GOKUL RETAIL - COPY THE OLD POSBean PC TO A NEW DISK
=====================================================

What this does
--------------
It copies the POSBean database files, the POSBean program folder, the D: drive
and the Desktop and Documents folders onto a NEW hard disk, so the old billing
data can be read later.

It does NOT format, delete, change or move anything on the old PC.
It only writes one new folder on the new disk:  OldPC-Backup-<date-and-time>
It never writes to C: or D:.

The copy runs in two phases, so billing is stopped for as little time as possible:

  PHASE A  (POSBean closed, a few minutes)
           Copies only the database files, cleanly, and checks their sizes.
           Then the database services start again.

  PHASE B  (POSBean may be open again)
           Copies the D: drive, the POSBean program folder and the Desktop and
           Documents folders. Database files are left out of these copies,
           because they were live. The clean copies from Phase A are used instead.

Steps for the shop owner
------------------------
1. Copy this whole folder (posbean-copy) onto the NEW 1 TB disk.

2. Turn off the old PC, fit the new disk, and turn the PC on. Log in as the
   usual Windows user (an Administrator account).

3. On the new disk, open the posbean-copy folder and double-click  Copy-OldPC.bat
   - Click YES if Windows asks for permission.
   - The script checks the drive it is running from. If that is a suitable
     new disk, it shows its letter, label, size and free space and asks you to
     type YES.
   - If the script is running from C: or D:, or the disk has too little free space,
     it asks you to type the letter of the new disk instead.

4. Before anything is stopped, the script prints a time estimate for each phase.

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

7. At the end the window says where the backup folder is and how many database
   files were copied and checked. Press any key to close.

8. Bring the disk back. Nothing on this computer was changed.

What is in the backup folder
----------------------------
  README-in-backup.txt  short note: which folder has the clean database copies
  inventory.txt         drives, programs, database services and every database-like
                        file found (name, size, date)
  run-log.txt           everything the script did, with times
  copy-log.txt          the detailed copy log from robocopy
  verify.txt            OK / MISSING / SIZE MISMATCH for each database file
  database-files\       CLEAN copies of all database files (use these to read POSBean data)
  D-drive\              the D: drive, without database files
  posbean-program\      the POSBean program folder, without database files
  C-user-files\         Desktop and Documents of each Windows user, without database files

If something goes wrong
-----------------------
- verify.txt lists MISSING or SIZE MISMATCH files. Tell the team; do not re-run
  into the same backup folder.
- If the script says a service could not be restarted, open Services (search
  "services" in the Start menu), find the service, and click Start before opening POSBean.
- Keep the old PC as it is until the team confirms the backup is readable.

Test without copying (for the team only)
----------------------------------------
Open PowerShell in this folder and run:

  powershell -NoProfile -ExecutionPolicy Bypass -File Copy-OldPC.ps1 -WhatIf

This only makes the inventory and prints the plan. It asks no questions, stops
nothing and copies nothing.
