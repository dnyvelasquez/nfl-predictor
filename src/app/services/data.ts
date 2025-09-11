import { Injectable } from '@angular/core';

export interface Participante {
  nombre: string;
}

export interface Equipo {
  nombre: string;
  puntaje: number;
  division: string;
  logo: string;
  participante: string;
}


@Injectable({
  providedIn: 'root'
})
export class Service {
  private participantes: Participante[] = [
    { nombre: 'Argemiro' },
    { nombre: 'Tomás' },
    { nombre: 'Nicolás' },
    { nombre: 'Juan Ricardo' },
    { nombre: 'Federico' },
    { nombre: 'Daniel' }
  ];

  private equipos: Equipo[] = [
    { nombre: 'Bills', puntaje: 0, division: 'AFC East', participante: 'Argemiro', logo: 'https://static.www.nfl.com/t_headshot_desktop/f_auto/league/api/clubs/logos/BUF'},
    { nombre: 'Dolphins', puntaje: 0, division: 'AFC East', participante: 'Tomás', logo: 'https://static.www.nfl.com/t_headshot_desktop/f_auto/league/api/clubs/logos/MIA'},
    { nombre: 'Patriots', puntaje: 0, division: 'AFC East', participante: 'No asignado', logo: 'https://static.www.nfl.com/t_headshot_desktop/f_auto/league/api/clubs/logos/NE'},
    { nombre: 'Jets', puntaje: 0, division: 'AFC East', participante: 'Juan Ricardo', logo: 'https://static.www.nfl.com/t_headshot_desktop/f_auto/league/api/clubs/logos/NYJ'},
    { nombre: 'Ravens', puntaje: 0, division: 'AFC North', participante: 'Nicolás', logo: 'https://static.www.nfl.com/t_headshot_desktop/f_auto/league/api/clubs/logos/BAL'},
    { nombre: 'Bengals', puntaje: 0, division: 'AFC North', participante: 'Daniel', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/CIN'},
    { nombre: 'Browns', puntaje: 0, division: 'AFC North', participante: 'No asignado', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/CLE'},
    { nombre: 'Steelers', puntaje: 0, division: 'AFC North', participante: 'Federico', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/PIT'},
    { nombre: 'Texans', puntaje: 0, division: 'AFC South', participante: 'Juan Ricardo', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/HOU'},
    { nombre: 'Colts', puntaje: 0, division: 'AFC South', participante: 'Nicolás', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/IND'},
    { nombre: 'Jaguars', puntaje: 0, division: 'AFC South', participante: 'Argemiro', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/JAX'},
    { nombre: 'Titans', puntaje: 0, division: 'AFC South', participante: 'No asignado', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/TEN'},
    { nombre: 'Broncos', puntaje: 0, division: 'AFC West', participante: 'No asignado', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/DEN'},
    { nombre: 'Chiefs', puntaje: 0, division: 'AFC West', participante: 'Tomás', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/KC'},
    { nombre: 'Raiders', puntaje: 0, division: 'AFC West', participante: 'Federico', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/LV'},
    { nombre: 'Chargers', puntaje: 0, division: 'AFC West', participante: 'Daniel', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/LAC'},
    { nombre: 'Cowboys', puntaje: 0, division: 'NFC East', participante: 'Nicolás', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/DAL'},
    { nombre: 'Giants', puntaje: 0, division: 'NFC East', participante: 'No asignado', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/NYG'},
    { nombre: 'Eagles', puntaje: 0, division: 'NFC East', participante: 'Federico', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/PHI'},
    { nombre: 'Commanders', puntaje: 0, division: 'NFC East', participante: 'Daniel', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/WAS'},
    { nombre: 'Bears', puntaje: 0, division: 'NFC North', participante: 'Argemiro', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/CHI'},
    { nombre: 'Lions', puntaje: 0, division: 'NFC North', participante: 'Daniel', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/DET'},
    { nombre: 'Packers', puntaje: 0, division: 'NFC North', participante: 'Juan Ricardo', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/GB'},
    { nombre: 'Vikings', puntaje: 0, division: 'NFC North', participante: 'No asignado', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/MIN'},
    { nombre: 'Falcons', puntaje: 0, division: 'NFC South', participante: 'Juan Ricardo', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/ATL'},
    { nombre: 'Panthers', puntaje: 0, division: 'NFC South', participante: 'No asignado', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/CAR'},
    { nombre: 'Saints', puntaje: 0, division: 'NFC South', participante: 'Federico', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/NO'},
    { nombre: 'Buccaneers', puntaje: 0, division: 'NFC South', participante: 'Tomás', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/TB'},
    { nombre: 'Cardinals', puntaje: 0, division: 'NFC West', participante: 'No aswignado', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/ARI'},
    { nombre: 'Rams', puntaje: 0, division: 'NFC West', participante: 'Argemiro', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/LA'},
    { nombre: '49ers', puntaje: 0, division: 'NFC West', participante: 'Nicolás', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/SF'},
    { nombre: 'Seahawks', puntaje: 0, division: 'NFC West', participante: 'Tomás', logo: 'https://static.www.nfl.com/h_16,w_16,q_auto,f_auto,dpr_2.0/league/api/clubs/logos/SEA'}
  ];

  getParticipantes(): Participante[] {
    return this.participantes;
  }

  getEquipos(): Equipo[] {
    return this.equipos;
  }

  getEquiposDe(participante: string): Equipo[] {
    return this.equipos.filter(eq => eq.participante === participante);
  }

  getPuntajeDeParticipante(nombre: string): number {
    return this.getEquiposDe(nombre)
      .reduce((acc, eq) => acc + eq.puntaje, 0);
  }

}
