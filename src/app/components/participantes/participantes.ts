import { Component, OnInit, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Observable } from 'rxjs';
import { Service, Participante } from '../../services/data';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

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
    MatInputModule
  ],
  templateUrl: './participantes.html',
  styleUrls: ['./participantes.css']
})
export class Participantes implements OnInit {

  private fb = inject(FormBuilder);
  private svc = inject(Service);
  private router = inject(Router);

  loading = false;
  errorMsg: string | null = null;
  okMsg: string | null = null;  

  participantes: Row[] = [];

  addForm = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    numero: [null as number | null, [Validators.required, Validators.min(0)]],
  });

  editForms: Record<string, FormGroup> = {};

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true; this.errorMsg = this.okMsg = null;
    this.svc.getParticipantes().subscribe({
      next: (rows) => { this.participantes = rows; },
      error: (e) => this.errorMsg = e?.message || 'No se pudieron cargar los participantes',
      complete: () => this.loading = false
    });
  }

  add(): void {
    if (this.addForm.invalid || this.loading) {
      this.addForm.markAllAsTouched();
      return;
    }
    const { nombre, numero } = this.addForm.value;
    this.loading = true; this.errorMsg = this.okMsg = null;

    this.svc.createParticipante(String(nombre), Number(numero)).subscribe({
      next: (row: Row) => {
        this.okMsg = 'Participante creado';
        this.addForm.reset();
        this.participantes = [...this.participantes, row]
          .sort((a, b) => a.numero - b.numero || a.nombre.localeCompare(b.nombre));
      },
      error: (e) => this.errorMsg = e?.message || 'No se pudo crear el participante',
      complete: () => this.loading = false
    });
  }

  startEdit(p: Row): void {
    if (!this.editForms[p.id]) {
      this.editForms[p.id] = this.fb.group({
        nombre: [p.nombre, [Validators.required, Validators.minLength(2)]],
        numero: [p.numero, [Validators.required, Validators.min(0)]],
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
      numero: Number(fg.value.numero),
    };

    if (patch.nombre === p.nombre && patch.numero === p.numero) {
      this.cancelEdit(p);
      return;
    }

    this.loading = true; this.errorMsg = this.okMsg = null;
    this.svc.updateParticipante(p.id, patch).subscribe({
      next: (row: Row) => {
        this.okMsg = 'Participante actualizado';
        this.participantes = this.participantes
          .map(x => x.id === p.id ? row : x)
          .sort((a, b) => a.numero - b.numero || a.nombre.localeCompare(b.nombre));
        this.cancelEdit(p);
      },
      error: (e) => this.errorMsg = e?.message || 'No se pudo actualizar',
      complete: () => this.loading = false
    });
  }

  remove(p: Row): void {
    const ok = confirm(`¿Eliminar a "${p.nombre}"? Esta acción no se puede deshacer.`);
    if (!ok) return;

    this.loading = true; this.errorMsg = this.okMsg = null;
    this.svc.deleteParticipante(p.id).subscribe({
      next: () => {
        this.okMsg = 'Participante eliminado';
        this.participantes = this.participantes.filter(x => x.id !== p.id);
        delete this.editForms[p.id];
      },
      error: (e) => this.errorMsg = e?.message || 'No se pudo eliminar',
      complete: () => this.loading = false
    });
  }



  logout(): void {
    this.svc.logout();
    this.router.navigate(['/login']);
  }  

}
