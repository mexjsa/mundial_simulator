import datetime

def get_daily_code(date_str, salt="nexos2026"):
    h = 2166136261
    input_str = f"{date_str}-{salt}"
    for char in input_str:
        h = h ^ ord(char)
        h = (h * 16777619) & 0xffffffff
    return f"{h % 1000000:06d}"

def main():
    print("==================================================")
    print("   Generador de Códigos Diarios - Simulador Nexos ")
    print("==================================================")
    
    # Calculate for today in America/Mexico_City (UTC-6)
    utc_now = datetime.datetime.now(datetime.timezone.utc)
    mx_now = utc_now - datetime.timedelta(hours=6)
    today_str = mx_now.strftime("%Y-%m-%d")
    tomorrow_str = (mx_now + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    
    code_today = get_daily_code(today_str)
    code_tomorrow = get_daily_code(tomorrow_str)
    
    print(f"Fecha de hoy (Mx): {today_str}")
    print(f"Código para HOY:  --->  {code_today}  <---")
    print(f"Código para MAÑANA: ---> {code_tomorrow} <---")
    print("--------------------------------------------------")
    print("Código Maestro permanente (Bypass): nexos2026")
    print("==================================================")
    
if __name__ == "__main__":
    main()
