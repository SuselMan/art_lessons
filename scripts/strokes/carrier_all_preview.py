"""Build the complete gallery of CPU experiments, including explicit missing inputs."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

from PIL import Image, ImageDraw, ImageFont
from carrier_replay import ROOT


def placeholder(path, text):
    im = Image.new('RGB', (500, 260), '#fbfaf7')
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 20)
    ImageDraw.Draw(im).text((24, 110), text, fill='#6b6b70', font=font)
    im.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('renders', type=Path)
    ap.add_argument('output', type=Path)
    args = ap.parse_args()
    dest = args.output
    dest.mkdir(parents=True, exist_ok=True)
    archive = json.loads((ROOT/'docs/reference/strokes/archive.json').read_text())
    digest = hashlib.sha256()
    for name in ['carrier.py', 'carrier_replay.py', 'carrier_all.py']:
        digest.update((Path(__file__).parent/name).read_bytes())
    all_reports = []
    rows = []
    for sheet in archive['sheets']:
        report = json.loads((args.renders/sheet['id']/'report.json').read_text())
        all_reports.append(report)
        # Stable comment version depends on source and physical inputs, not CPU duration.
        room = sheet.get('board', {}).get('room', '').rstrip('/').split('/')[-1]
        source = ROOT/'temp/strokes-app'/f'ops_{room}.json'
        if source.exists():
            digest.update(source.read_bytes())
        states = {s['n']: s['status'] for s in report['strokes']}
        for stroke in sheet['strokes']:
            n = stroke['n']
            tag = f'{sheet["id"]}-{n:03d}'
            names = {'photo': tag+'-photo.jpg', 'before': tag+'-before.jpg',
                     'after': tag+'.png', 'wet': tag+'-wet.png', 'motion': tag+'-motion.gif'}
            photo = stroke.get('dry') or stroke.get('wet', [])[-1]
            shutil.copyfile(ROOT/'docs/reference/strokes'/photo['src'], dest/names['photo'])
            old = stroke.get('app', {}).get('0a78ab53')
            if old:
                shutil.copyfile(ROOT/'docs/reference/strokes'/old['src'], dest/names['before'])
            else:
                placeholder(dest/names['before'], 'Нет повтора Grafetto')
            status = states.get(n, 'no-recorded-room')
            if status == 'rendered':
                for key, suffix in [('after','.png'), ('wet','-wet.png'), ('motion','-motion.gif')]:
                    shutil.copyfile(args.renders/sheet['id']/f'{n:03d}{suffix}', dest/names[key])
            else:
                placeholder(dest/names['after'], 'Нет записи движения кисти')
                names['wet'] = names['after']
                names['motion'] = names['after']
            rows.append({'sheet': sheet['id'], 'n': n, 'status': status, **names})
    version = 'cpu-all-' + digest.hexdigest()[:12]
    template = (Path(__file__).parent/'carrier_preview.html').read_text()
    template = template.replace('Лист 9 — численный эксперимент', 'Все листы — численный эксперимент')
    template = template.replace('let index=0,request=0;', 'let index=0,request=0;')
    template = template.replace('const data=__DATA__,version=__VERSION__;', 'const allData=__DATA__,version=__VERSION__;let data=allData;')
    template = template.replace('<nav><button', '<nav><label for="sheet">Лист</label><select id="sheet"><option value="all">Все</option></select><button', 1)
    template = template.replace("o.textContent='№ '+s.n", "o.textContent='Лист '+s.sheet+' · № '+s.n")
    template = template.replace("c.sheet==='9'", "c.sheet===data[index].sheet")
    template = template.replace("drafts.get(s.n)", "drafts.get(s.sheet+':'+s.n)")
    template = template.replace("drafts.set(data[index].n,", "drafts.set(data[index].sheet+':'+data[index].n,")
    template = template.replace("drafts.delete(n)", "drafts.delete(sheet+':'+n)")
    template = template.replace("const n=data[index].n;", "const n=data[index].n,sheet=data[index].sheet;")
    template = template.replace("{sheet:'9',n,version", "{sheet,n,version")
    template = template.replace("if(data[index].n===n)", "if(data[index].n===n&&data[index].sheet===sheet)")
    template = template.replace("o.value=s.n", "o.value=s.sheet+':'+s.n")
    template = template.replace("el('stroke').value=s.n", "el('stroke').value=s.sheet+':'+s.n")
    template = template.replace("s.n===Number(el('stroke').value)", "s.sheet+':'+s.n===el('stroke').value")
    template = template.replace("'#'+s.n", "'#'+s.sheet+':'+s.n")
    template = template.replace("s.n===Number(location.hash.slice(1))", "s.sheet+':'+s.n===location.hash.slice(1)")
    template = template.replace("function image(){", "function image(){el('missing').textContent=data[index].status==='rendered'?'':'Нет записи для расчёта: показана фотография, численный результат отсутствует.';")
    template = template.replace('<div class="panes">', '<p id="missing" class="note" role="status"></p><div class="panes">', 1)
    template = template.replace('Общие настройки всех шести:', 'Общие настройки всех рассчитанных мазков:')
    template = template.replace('Анимация показывает только движение кисти, без последующей сушки.', 'Проходы внутри одной рамки рассчитаны последовательно с сохранением воды и отдельных пигментов. Уровни воды и пигмента берутся из preset. Паузы приближены по timestamps операций; отрицательные паузы приняты за ноль. Анимация показывает контакты кисти, пропуская паузы и последующую сушку.')
    template = template.replace('for(const s of data){', 'function options(){el("stroke").replaceChildren();for(const s of data){', 1)
    template = template.replace("el('stroke').append(o)}", "el('stroke').append(o)}}options();for(const id of [...new Set(allData.map(s=>s.sheet))]){const o=document.createElement('option');o.value=id;o.textContent='Лист '+id;el('sheet').append(o)}el('sheet').onchange=()=>{data=allData.filter(s=>el('sheet').value==='all'||s.sheet===el('sheet').value);index=0;options();show()};", 1)
    (dest/'index.html').write_text(template.replace('__DATA__', json.dumps(rows)).replace('__VERSION__', json.dumps(version)))
    (dest/'report.json').write_text(json.dumps({'version': version, 'sheets': all_reports}, indent=2))
    print(json.dumps({'version':version, 'photos':len(rows), 'rendered':sum(r['status']=='rendered' for r in rows)}))


if __name__ == '__main__':
    main()
