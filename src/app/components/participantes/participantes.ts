import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ParticipantesService } from '../../services/participantes';
import { GruposService, Grupo } from '../../services/grupos';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth/auth';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';

type Row = { id: string; nombre: string; numero: number };

@Component({
  selector: 'app-participantes',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    MatIconModule,
    MatMenuModule,
    MatButtonModule,
    RouterModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './participantes.html',
  styleUrls: ['./participantes.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Participantes implements OnInit {

  private fb = inject(FormBuilder);
  private svc = inject(ParticipantesService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private gruposService = inject(GruposService);

  // Solo el super usuario edita a mano (RLS también rechaza la escritura de los demás roles).
  esSuperusuario = toSignal(inject(AuthService).esSuperusuario$(), { initialValue: false });

  loading = false;
  errorMsg: string | null = null;
  okMsg: string | null = null;  

  participantes: Row[] = [];

  grupos: Grupo[] = [];
  grupoId: string | null = null;

  addForm = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
  });

  editForms: Record<string, FormGroup> = {};

  ngOnInit(): void {
    this.loading = true;
    this.gruposService.gruposDisponibles$().subscribe({
      next: ({ grupos, seleccionado }) => {
        this.grupos = grupos;
        this.grupoId = seleccionado;
        this.load();
      },
      error: (e) => {
        this.errorMsg = e?.message || 'No se pudieron cargar los grupos';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  cambiarGrupo(grupoId: string): void {
    this.grupoId = grupoId;
    this.gruposService.recordarGrupo(grupoId);
    this.editForms = {};
    this.load();
  }

  load(): void {
    this.loading = true; this.errorMsg = this.okMsg = null;
    if (!this.grupoId) {
      this.participantes = [];
      this.errorMsg = 'Tu usuario no pertenece a ningún grupo';
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }
    this.svc.getParticipantes(this.grupoId).pipe(
      finalize(() => { this.loading = false; this.cdr.detectChanges(); })
    ).subscribe({
      next: (rows) => { this.participantes = rows; },
      error: (e) => this.errorMsg = e?.message || 'No se pudieron cargar los participantes',
    });
  }

  add(): void {
    if (this.addForm.invalid || this.loading || !this.grupoId) {
      this.addForm.markAllAsTouched();
      return;
    }
    const { nombre } = this.addForm.value;
    this.loading = true; this.errorMsg = this.okMsg = null;

    this.svc.createParticipante(String(nombre), this.grupoId).pipe(
      finalize(() => { this.loading = false; this.cdr.detectChanges(); })
    ).subscribe({
      next: (row: Row) => {
        this.okMsg = 'Participante creado';
        this.addForm.reset();
        this.participantes = [...this.participantes, row]
          .sort((a, b) => a.numero - b.numero || a.nombre.localeCompare(b.nombre));
      },
      error: (e) => this.errorMsg = e?.message || 'No se pudo crear el participante',
    });
  }

  startEdit(p: Row): void {
    if (!this.editForms[p.id]) {
      this.editForms[p.id] = this.fb.group({
        nombre: [p.nombre, [Validators.required, Validators.minLength(2)]],
      });
    }
  }

  cancelEdit(p: Row): void {
    delete this.editForms[p.id];
  }

  saveEdit(p: Row): void {
    const fg = this.editForms[p.id];
    if (!fg || fg.invalid) { fg?.markAllAsTouched(); return; }

    const patch = {
      nombre: String(fg.value.nombre),
    };

    if (patch.nombre === p.nombre) {
      this.cancelEdit(p);
      return;
    }

    this.loading = true; this.errorMsg = this.okMsg = null;
    this.svc.updateParticipante(p.id, patch).pipe(
      finalize(() => { this.loading = false; this.cdr.detectChanges(); })
    ).subscribe({
      next: (row: Row) => {
        this.okMsg = 'Participante actualizado';
        this.participantes = this.participantes
          .map(x => x.id === p.id ? row : x)
          .sort((a, b) => a.numero - b.numero || a.nombre.localeCompare(b.nombre));
        this.cancelEdit(p);
      },
      error: (e) => this.errorMsg = e?.message || 'No se pudo actualizar',
    });
  }

  sortearNumeros(): void {
    if (this.loading || this.participantes.length === 0 || !this.grupoId) return;

    const ok = confirm('¿Asignar un número aleatorio a cada participante? Esto reemplazará los números actuales.');
    if (!ok) return;

    this.loading = true; this.errorMsg = this.okMsg = null;
    this.svc.asignarNumerosAleatorios(this.grupoId).pipe(
      finalize(() => { this.loading = false; this.cdr.detectChanges(); })
    ).subscribe({
      next: (rows: Row[]) => {
        this.okMsg = 'Números asignados aleatoriamente';
        this.participantes = rows;
        this.editForms = {};
      },
      error: (e) => this.errorMsg = e?.message || 'No se pudieron asignar los números',
    });
  }

  remove(p: Row): void {
    const ok = confirm(`¿Eliminar a "${p.nombre}"? Esta acción no se puede deshacer.`);
    if (!ok) return;

    this.loading = true; this.errorMsg = this.okMsg = null;
    this.svc.deleteParticipante(p.id).pipe(
      finalize(() => { this.loading = false; this.cdr.detectChanges(); })
    ).subscribe({
      next: () => {
        this.okMsg = 'Participante eliminado';
        this.participantes = this.participantes.filter(x => x.id !== p.id);
        delete this.editForms[p.id];
      },
      error: (e) => this.errorMsg = e?.message || 'No se pudo eliminar',
    });
  }



  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }  

}
