import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Participante } from '../../services/data';

@Component({
  selector: 'app-participante-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatDividerModule,
    MatDialogModule,
    MatIconModule
  ],
  templateUrl: './participante-dialog.html',
  styleUrls: ['./participante-dialog.css'],
})
export class ParticipanteDialog {
  constructor(
    public dialogRef: MatDialogRef<ParticipanteDialog>,
    @Inject(MAT_DIALOG_DATA) public data: Participante
  ) {}

  cerrar(): void {
    this.dialogRef.close();
  }
}
