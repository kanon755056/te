################################################################################
Overview of directory contents:
################################################################################

demo1/:
  - Contains web apps that show steps to establish a browser to browser call.
  - Load demo1/index.html, which shows how to run the web apps.

demo2/:
  - Contains web apps that show a customer calling an agent.
  - Load demo2/index.html, which shows how to run the web apps.

Note: The RSMP Javascript API is an interface to access functionalities provided
      by the Genesys RSMP Gateway, so to make these demo web apps work, it needs
      a working RSMP Gateway, and possibly other components depending on your
      setting (e.g., SIP Server, Universal Routing Server, STUN Server). All web
      apps are using example values for these parameters; therefore, users of
      these web apps needs to modify the corresponding sections to use valid
      values based on their settings. Such sections are usually where the "conf"
      object is created and initialized in the web apps. Consult your RSMP and
      SIP Server administrator to find what configuration values you should use.
