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

type Celda = {
  division: string;
  participante: string;
  value: string | null;
};

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
  okMsg = signal<string | null>(null);

  participantes = signal<Participante[]>([]);
  equipos = signal<Equipo[]>([]);

  divisiones = computed(() => {
    const set = new Set(this.equipos().map(e => e.division));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  equiposPorDivision = computed(() => {
    const mapDiv: Record<string, Equipo[]> = {};
    for (const d of this.divisiones()) mapDiv[d] = [];
    for (const e of this.equipos()) {
      (mapDiv[e.division] ??= []).push(e);
    }
    for (const d of Object.keys(mapDiv)) {
      mapDiv[d].sort((a, b) => a.nombre.localeCompare(b.nombre));
    }
    return mapDiv;
  });

  equiposOcupadosIds = computed(() => {
    const used = new Set<string>();
    for (const e of this.equipos()) {
      if (e.participante && e.participante.trim() !== '') used.add(e.id);
    }
    return used;
  });

  valorCelda(d: string, participanteNombre: string): string | null {
    const eq = this.equipos()
      .find(e => e.division === d && e.participante === participanteNombre);
    return eq ? eq.id : null;
  }

  ngOnInit(): void {
    this.cargarTodo();
  }

  private cargarTodo() {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.okMsg.set(null);

    forkJoin({
      participantes: this.svc.getParticipantes(),
      equipos: this.svc.getEquipos()
    }).subscribe({
      next: ({ participantes, equipos }) => {
        const ordPart = [...participantes].sort(
          (a, b) => (a.numero ?? 0) - (b.numero ?? 0) || a.nombre.localeCompare(b.nombre)
        );
        this.participantes.set(ordPart);
        this.equipos.set(equipos);
      },
      error: (e) => this.errorMsg.set(e?.message || 'No fue posible cargar la asignación'),
      complete: () => this.loading.set(false)
    });
  }

  opcionesPara(d: string, participanteNombre: string): Equipo[] {
    const usados = this.equiposOcupadosIds();
    const actualId = this.valorCelda(d, participanteNombre);
    return (this.equiposPorDivision()[d] ?? []).filter(eq =>
      !usados.has(eq.id) || eq.id === actualId
    );
  }

  onChangeCelda(d: string, participanteNombre: string, equipoId: string | null) {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.okMsg.set(null);

    this.svc.assignEquipo(participanteNombre, d, equipoId).subscribe({
      next: () => {
        const lista = [...this.equipos()];
        for (const e of lista) {
          if (e.division === d && e.participante === participanteNombre) {
            e.participante = '';
          }
        }
        if (equipoId) {
          const target = lista.find(e => e.id === equipoId);
          if (target) target.participante = participanteNombre;
        }
        this.equipos.set(lista);
        this.okMsg.set('Asignación actualizada');
      },
      error: (e) => this.errorMsg.set(e?.message || 'No se pudo actualizar la asignación'),
      complete: () => this.loading.set(false),
    });
  }

  resetAll() {
    const ok = confirm('¿Quitar TODAS las asignaciones en temporada regular?');
    if (!ok) return;

    this.loading.set(true);
    this.errorMsg.set(null);
    this.okMsg.set(null);

    this.svc.resetAsignaciones().subscribe({
      next: () => {
        const lista = this.equipos().map(e => ({ ...e, participante: '' as string }));
        this.equipos.set(lista);
        this.okMsg.set('Asignaciones de temporada regular reiniciadas');
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
