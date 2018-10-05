using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Xml;
using System.Xml.Schema;

namespace xsd
{
    public class ValidationResult
    {
        public ValidationResult() { }

        public string Severity { get; set; }
        public string Message { get; set; }
        public int LineNumber { get; set; }
        public int LinePosition { get; set; }
    }

    public class Result
    {
        public Result() { }

        public List<ValidationResult> Errors { get; set; } = new List<ValidationResult>();

        public List<string> Recommentations { get; set; } = new List<string>();
    }


    internal class Program
    {
        private static void Main(string[] args)
        {
            int line = 0;
            int pos = 0;

            // Create the XmlReader object
            string content;
            if (args.Length > 0)
            {
                var path = new Uri(Uri.UnescapeDataString(args[0])).AbsolutePath;
                path = Path.GetFullPath(path);
                content = File.ReadAllText(path);

                if (args.Length == 3)
                {
                    line = int.Parse(args[1]);
                    pos = int.Parse(args[2]);
                }
            }
            else
            {
                using (var reader = new StreamReader(Console.OpenStandardInput()))
                {
                    content = reader.ReadToEnd();
                }
            }
            string[] lines = content.Split("\n");

            // convert string to stream
            byte[] byteArray = Encoding.UTF8.GetBytes(content);
            MemoryStream stream = new MemoryStream(byteArray);

            // System.Xml.Schema section from https://github.com/dotnet/corefx/wiki/ApiCompat#systemxmlschema
            AppContext.SetSwitch("Switch.System.Xml.AllowDefaultResolver", true);

            // Set the validation settings.
            XmlReaderSettings settings = new XmlReaderSettings();
            settings.ValidationType = ValidationType.Schema;
            settings.ValidationFlags |= XmlSchemaValidationFlags.ProcessInlineSchema;
            settings.ValidationFlags |= XmlSchemaValidationFlags.ProcessSchemaLocation;
            settings.ValidationFlags |= XmlSchemaValidationFlags.ReportValidationWarnings;
            settings.XmlResolver = new XmlUrlResolver();
            settings.Schemas = new XmlSchemaSet();
            var result = new Result();
            result.Errors = new List<ValidationResult>();
            result.Recommentations = new List<string>();
            settings.ValidationEventHandler += new System.Xml.Schema.ValidationEventHandler((object sender, ValidationEventArgs validationArgs) =>
            {
                result.Errors.Add(new ValidationResult()
                {
                    Message = validationArgs.Message,
                    Severity = validationArgs.Severity.ToString(),
                    LineNumber = validationArgs.Exception.LineNumber,
                    LinePosition = validationArgs.Exception.LinePosition
                });
            });

            XmlReader xmlReader = XmlReader.Create(stream, settings);

            IXmlLineInfo lineInfo = (IXmlLineInfo)xmlReader;
            try
            {
                // Parse the file. 
                while (xmlReader.Read())
                {
                    if (xmlReader.NodeType == XmlNodeType.Element)
                    {
                        if (xmlReader.MoveToFirstAttribute())
                        {
                            do
                            {
                                if (xmlReader.NamespaceURI == "http://www.w3.org/2001/XMLSchema-instance")
                                {
                                    if (xmlReader.LocalName == "schemaLocation")
                                    {
                                        var parts = xmlReader.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                                        for (int i = 0; i < parts.Length; i += 2)
                                        {
                                            var destination = parts[i + 1];
                                            if (!Path.IsPathFullyQualified(destination))
                                            {
                                                destination = Path.Combine(Environment.CurrentDirectory, destination);
                                            }

                                            settings.Schemas.Add(parts[i], destination);
                                        }
                                    }
                                    else if (xmlReader.LocalName == "noNamespaceSchemaLocation")
                                    {
                                        var destination = xmlReader.Value;
                                        if (!Path.IsPathFullyQualified(destination))
                                        {
                                            destination = Path.Combine(Environment.CurrentDirectory, destination);
                                        }

                                        settings.Schemas.Add(String.Empty, destination);
                                    }
                                }
                            } while (xmlReader.MoveToNextAttribute());
                        }
                        //if (lineInfo.LineNumber >= line && lineInfo.LinePosition >= pos)
                        //{
                        //    // we are on element...
                        //    xmlReader.Name
                        //}
                    }
                }
            }
            catch (XmlException err)
            {
                result.Errors.Add(new ValidationResult()
                {
                    Message = err.Message,
                    Severity = XmlSeverityType.Error.ToString(),
                    LineNumber = err.LineNumber,
                    LinePosition = err.LinePosition
                });

                settings.Schemas.Compile();
                // if < + no namespace, then show union of namespaces + nonamespace elements

                // if < + namespace, then show union of elements in namespace

                // if < + namesace + parent element name + period then show properties of parent element name

                // if has attributes or position is after element name then show attributes of element
            }

            Console.WriteLine(JsonConvert.SerializeObject(result, Newtonsoft.Json.Formatting.Indented));
        }
    }
}
