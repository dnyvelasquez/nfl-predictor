import { Component, OnInit, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { Service, Participante, Equipo } from '../../services/data';
import { forkJoin } from 'rxjs';
import { Router, RouterModule } from '@angular/router';

type AsignacionRow = { id?: string; equipo_id: string; participante: string };

@Component({
  selector: 'app-asignacion',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    RouterModule,
    MatMenuModule
  ],
  templateUrl: './asignacion.html',
  styleUrls: ['./asignacion.css'],
})
export class Asignacion implements OnInit {
  private svc = inject(Service);
  private router = inject(Router);

  loading = signal(true);
  errorMsg = signal<string | null>(null);
  okMsg    = signal<string | null>(null);

  participantes = signal<Participante[]>([]);
  equipos       = signal<Equipo[]>([]);
  asignaciones  = signal<AsignacionRow[]>([]);

  ngOnInit(): void { this.cargarTodo(); }

  private cargarTodo() {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.okMsg.set(null);

    forkJoin({
      participantes: this.svc.getParticipantes(),
      equipos:       this.svc.getEquipos(), 
      asign:         this.svc.getAsignaciones(),
    }).subscribe({
      next: ({ participantes, equipos, asign }) => {
        const ordPart = [...participantes].sort(
          (a, b) => (a.numero ?? 0) - (b.numero ?? 0) || a.nombre.localeCompare(b.nombre)
        );
        this.participantes.set(ordPart);
        this.equipos.set(equipos);
        this.asignaciones.set(asign ?? []);
      },
      error: (e) => this.errorMsg.set(e?.message || 'No fue posible cargar la asignación'),
      complete: () => this.loading.set(false)
    });
  }

  private equipoById = computed<Record<string, Equipo>>(() => {
    const map: Record<string, Equipo> = {};
    for (const e of this.equipos()) map[e.id] = e;
    return map;
  });

  divisiones = computed(() => {
    const set = new Set(this.equipos().map(e => e.division));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  equiposPorDivision = computed(() => {
    const mapDiv: Record<string, Equipo[]> = {};
    for (const d of this.divisiones()) mapDiv[d] = [];
    for (const e of this.equipos()) (mapDiv[e.division] ??= []).push(e);
    for (const d of Object.keys(mapDiv)) mapDiv[d].sort((a, b) => a.nombre.localeCompare(b.nombre));
    return mapDiv;
  });

  valorCelda(d: string, participanteNombre: string): string | null {
    const byId = this.equipoById();
    const row = this.asignaciones()
      .find(a => a.participante === participanteNombre && byId[a.equipo_id]?.division === d);
    return row ? row.equipo_id : null;
  }

  opcionesPara(d: string): Equipo[] {
    return this.equiposPorDivision()[d] ?? [];
  }

  asignadoA(equipoId: string): string[] {
    return this.asignaciones()
      .filter(a => a.equipo_id === equipoId)
      .map(a => a.participante);
  }

  onChangeCelda(division: string, participanteNombre: string, equipoId: string | null) {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.okMsg.set(null);

    this.svc.assignEquipo(participanteNombre, division, equipoId).subscribe({
      next: () => {
        const byId = this.equipoById();
        const prev = this.asignaciones().filter(
          a => !(a.participante === participanteNombre && byId[a.equipo_id]?.division === division)
        );

        if (equipoId) {
          prev.push({ equipo_id: equipoId, participante: participanteNombre });
        }

        this.asignaciones.set(prev);
        this.okMsg.set('Asignación actualizada');
      },
      error: (e) => this.errorMsg.set(e?.message || 'No se pudo actualizar la asignación'),
      complete: () => this.loading.set(false),
    });
  }

  resetAll() {
    const ok = confirm('¿Quitar TODAS las asignaciones?');
    if (!ok) return;

    this.loading.set(true);
    this.errorMsg.set(null);
    this.okMsg.set(null);

    this.svc.resetAsignaciones().subscribe({
      next: () => {
        this.asignaciones.set([]);
        this.okMsg.set('Asignaciones reiniciadas');
      },
      error: (e) => this.errorMsg.set(e?.message || 'No se pudo reiniciar'),
      complete: () => this.loading.set(false),
    });
  }

  logout(): void {
    this.svc.logout();
    this.router.navigate(['/login']);
  }
}
