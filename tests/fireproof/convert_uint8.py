import sys
import os

def file_to_js_uint8array(input_file, output_file):
    with open(input_file, 'rb') as f:
        content = f.read()
    
    uint8array = ', '.join(str(byte) for byte in content)
    
    js_content = f"const fileContent = new Uint8Array([{uint8array}]);\n\n"
    js_content += "// You can use this Uint8Array as needed in your JavaScript code\n"
    js_content += "// For example, to create a Blob:\n"
    js_content += "// const blob = new Blob([fileContent], { type: 'application/octet-stream' });\n"
    
    with open(output_file, 'w') as f:
        f.write(js_content)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python script.py <input_file>")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = os.path.splitext(input_file)[0] + '.js'

    file_to_js_uint8array(input_file, output_file)
    print(f"Converted {input_file} to {output_file}")