import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Participante } from '../../services/participantes';
import { estadoEquipoEnEtapa, Etapa } from '../../services/core/etapas';
import { IdiomaService, traducirEtapa } from '../../i18n/idioma';
import { TPipe } from '../../i18n/t.pipe';

@Component({
  selector: 'app-participante-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatDividerModule,
    MatDialogModule,
    MatIconModule,
    TPipe
  ],
  templateUrl: './participante-dialog.html',
  styleUrls: ['./participante-dialog.css'],
})
export class ParticipanteDialog {
  private idioma = inject(IdiomaService);
  readonly estadoEquipo = (item: Parameters<typeof estadoEquipoEnEtapa>[0]) => estadoEquipoEnEtapa(item, this.idioma.actual());
  readonly etapa = (e: Etapa) => traducirEtapa(this.idioma.actual(), e);

  constructor(
    public dialogRef: MatDialogRef<ParticipanteDialog>,
    @Inject(MAT_DIALOG_DATA) public data: Participante
  ) {}

  cerrar(): void {
    this.dialogRef.close();
  }
}
